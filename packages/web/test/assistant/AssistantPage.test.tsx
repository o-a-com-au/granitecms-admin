import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { act } from "react";
import { AssistantPage } from "../../src/assistant/AssistantPage.tsx";
import { AssistantProvider } from "../../src/assistant/AssistantContext.tsx";
import { createFakeStorage } from "../helpers/fakeStorage.ts";
import { ToastProvider } from "../../src/toast/ToastContext.tsx";
import {
  PageActionsProvider,
  PageDeviceToggleProvider,
} from "../../src/layout/PageActionsContext.tsx";
import {
  PreviewProvider,
  usePreview,
} from "../../src/layout/PreviewContext.tsx";

function PreviewProbe() {
  const { previewUrl, previewGeneration } = usePreview();
  return (
    <span data-testid="preview">{`${previewUrl ?? "none"} #${previewGeneration}`}</span>
  );
}

// Stands in for AppShell, above the routes as there: the header's page
// actions, the shared preview, and the Assistant's conversation.
function Host({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  const [, setDeviceToggle] = useState<ReactNode>(null);
  return (
    <ToastProvider>
      <PreviewProvider siteId="site-1">
        <AssistantProvider siteId="site-1">
          <PageActionsProvider setActions={setActions}>
            <PageDeviceToggleProvider setDeviceToggle={setDeviceToggle}>
              <div data-testid="header-actions">{actions}</div>
              {children}
              <PreviewProbe />
            </PageDeviceToggleProvider>
          </PageActionsProvider>
        </AssistantProvider>
      </PreviewProvider>
    </ToastProvider>
  );
}

interface AssistantCall {
  messages: Array<{ role: string; text: string }>;
  currentUrl: string | null;
}

// Answers the assistant route with a stream of events (one per line);
// everything else the page asks for is a 404.
function renderPage(
  answer: (call: AssistantCall) => Response = () =>
    streamOf([{ type: "done" }]),
) {
  const calls: AssistantCall[] = [];
  // Where the current page is remembered (the top bar checks it).
  vi.stubGlobal("localStorage", createFakeStorage());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === "/api/sites/site-1/assistant") {
        const call = JSON.parse(init?.body as string) as AssistantCall;
        calls.push(call);
        return answer(call);
      }
      // The Tastings page has a draft; nothing else does.
      if (
        input.toString() === "/api/sites/site-1/content/pages/tastings.json"
      ) {
        return new Response("{}", {
          status: 200,
          headers: { etag: '"1"', "x-content-source": "draft" },
        });
      }
      return new Response("{}", { status: 404 });
    }),
  );
  const router = createMemoryRouter(
    [
      {
        element: (
          <Host>
            <Outlet />
          </Host>
        ),
        children: [
          { path: "/sites/:siteId/assistant", element: <AssistantPage /> },
          { path: "/sites/:siteId/content", element: <p>pages hub</p> },
        ],
      },
    ],
    { initialEntries: ["/sites/site-1/assistant"] },
  );
  render(<RouterProvider router={router} />);
  return Object.assign(calls, { router });
}

function streamOf(events: unknown[]): Response {
  const body = events.map((event) => `${JSON.stringify(event)}\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantPage", () => {
  it("starts empty with suggestions that fill the message box", () => {
    renderPage();
    expect(screen.getByText("How can I help with your website?")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Which pages mention" }),
    );
    expect(
      (screen.getByLabelText("Message the assistant") as HTMLTextAreaElement)
        .value,
    ).toBe("Which pages mention ");
  });

  it("sends with Enter (Shift+Enter does not), streams the reply in, and sends the conversation so far next time", async () => {
    const calls = renderPage((call) =>
      call.messages.length === 1
        ? streamOf([
            { type: "tool", label: "Looking through the pages" },
            { type: "text", text: "You have **two** pages:\n- Home\n" },
            { type: "text", text: "- Tastings" },
            { type: "done" },
          ])
        : streamOf([{ type: "text", text: "Sure." }, { type: "done" }]),
    );
    const input = screen.getByLabelText("Message the assistant");
    expect(
      (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(input, { target: { value: "Which pages do I have?" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(calls).toHaveLength(0);

    fireEvent.keyDown(input, { key: "Enter" });
    expect((input as HTMLTextAreaElement).value).toBe("");
    await waitFor(() => expect(screen.getByText("two").tagName).toBe("STRONG"));
    expect(screen.getByText("Tastings").tagName).toBe("LI");
    expect(calls[0]).toEqual({
      messages: [{ role: "user", text: "Which pages do I have?" }],
      currentUrl: null,
    });

    fireEvent.change(input, { target: { value: "Thanks" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Sure.")).toBeDefined());
    expect(calls[1]?.messages).toEqual([
      { role: "user", text: "Which pages do I have?" },
      {
        role: "assistant",
        text: "You have **two** pages:\n- Home\n- Tastings",
      },
      { role: "user", text: "Thanks" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("How can I help with your website?")).toBeDefined();
  });

  it("shows a refusal (not on Pro) as the reply, and leaves it out of the next message", async () => {
    const calls = renderPage((call) =>
      call.messages.length === 1
        ? new Response(
            JSON.stringify({
              error: "The assistant is part of the Pro plan.",
              reason: "plan",
            }),
            { status: 403 },
          )
        : streamOf([{ type: "done" }]),
    );
    const input = screen.getByLabelText("Message the assistant");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(
        screen.getByText("The assistant is part of the Pro plan."),
      ).toBeDefined(),
    );

    fireEvent.change(input, { target: { value: "Again" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.messages).toEqual([
      { role: "user", text: "Hello" },
      { role: "user", text: "Again" },
    ]);
  });

  it("shows the error the server streams when the assistant fails part-way", async () => {
    renderPage(() =>
      streamOf([
        {
          type: "error",
          message: "The assistant is busy right now. Try again in a minute.",
        },
      ]),
    );
    const input = screen.getByLabelText("Message the assistant");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(
        screen.getByText(
          "The assistant is busy right now. Try again in a minute.",
        ),
      ).toBeDefined(),
    );
  });

  it("moves the preview to a page the assistant shows, and reloads one it changes", async () => {
    renderPage(() =>
      streamOf([
        { type: "show", path: "pages/about.json", url: "/about" },
        { type: "tool", label: "Updating /tastings" },
        { type: "changed", path: "pages/tastings.json", url: "/tastings" },
        { type: "text", text: "Done." },
        { type: "done" },
      ]),
    );
    const before = Number(
      /#(\d+)/.exec(screen.getByTestId("preview").textContent ?? "")?.[1],
    );
    const input = screen.getByLabelText("Message the assistant");
    fireEvent.change(input, {
      target: { value: "Change the tastings heading" },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Done.")).toBeDefined());
    const after = /^(\S+) #(\d+)$/.exec(
      screen.getByTestId("preview").textContent ?? "",
    );
    expect(after?.[1]).toBe("/tastings");
    expect(Number(after?.[2])).toBeGreaterThan(before);
    // The top bar checks the page the assistant changed, so its draft
    // shows Save Changes (a bare preview move left it checking the page
    // shown before).
    await waitFor(() =>
      expect(
        within(screen.getByTestId("header-actions")).getByRole("button", {
          name: "Save Changes",
        }),
      ).toBeDefined(),
    );
  });

  it("keeps the conversation when the person goes elsewhere and comes back", async () => {
    const { router } = renderPage(() =>
      streamOf([{ type: "text", text: "Hello Jane." }, { type: "done" }]),
    );
    const input = screen.getByLabelText("Message the assistant");
    fireEvent.change(input, { target: { value: "Hi" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("Hello Jane.")).toBeDefined());

    await act(() => router.navigate("/sites/site-1/content"));
    expect(screen.getByText("pages hub")).toBeDefined();
    await act(() => router.navigate("/sites/site-1/assistant"));

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Hi", "Hello Jane."]);
  });
});
