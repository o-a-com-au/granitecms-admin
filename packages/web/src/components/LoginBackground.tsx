import { useEffect, useRef } from 'react';

// The full-bleed video background shared by Login and Signup,
// requested directly with a reference prototype. Three fixed layers:
// the clip itself, then two flat overlays of the same colour that
// grade it - a multiply pass to darken, a normal pass to lift and
// flatten - so the form sitting over it stays readable on whichever
// frame happens to be showing.
//
// Served from packages/web/public, so it is a plain root-relative URL
// in both dev (Vite serves public/ at /) and production (the built
// copy lands in dist/, which @fastify/static serves from its root).
// Deliberately not a bundled import - a 1.1MB asset has no business
// going through the module graph just to come back out as a URL.
export function LoginBackground() {
  // Honour reduced motion by simply never starting playback, rather
  // than pausing after the fact - the video still paints its first
  // frame, so the page keeps its look without the movement.
  //
  // jsdom (the test environment) implements no matchMedia at all,
  // while lib.dom.d.ts declares it as always present, so a plain
  // existence check would narrow to `never` under strict mode - a
  // typeof check is a value check, which doesn't. Same underlying
  // problem test/setup.ts already works around for scrollIntoView and
  // execCommand, handled here instead of with another global stub so
  // the guard is real code under test rather than a test-only shim.
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Every browser refuses to autoplay a video that isn't muted, and
  // React has a long-standing habit of not reflecting the `muted`
  // prop onto the DOM property. Setting it directly on mount is the
  // reliable form, and costs one ref.
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
    }
  }, []);

  return (
    <div className="login-background" aria-hidden="true">
      <video ref={videoRef} className="login-background-video" autoPlay={!prefersReducedMotion} muted loop playsInline preload="auto">
        <source src="/background.mp4" type="video/mp4" />
      </video>
      <div className="login-tint login-tint-multiply" />
      <div className="login-tint login-tint-flat" />
    </div>
  );
}
