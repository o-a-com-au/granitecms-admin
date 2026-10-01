import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contentPath, pageText, pageUrl, ToolError } from '../../src/assistant/tools.ts';

describe('assistant tools: page addresses', () => {
  it('turns a page URL or content path into a content path', () => {
    assert.equal(contentPath('/'), 'pages/index.json');
    assert.equal(contentPath(''), 'pages/index.json');
    assert.equal(contentPath('/about/team/'), 'pages/about/team.json');
    assert.equal(contentPath('/about?x=1#team'), 'pages/about.json');
    assert.equal(contentPath('pages/about.json'), 'pages/about.json');
    assert.equal(contentPath('menus/main.json'), 'menus/main.json');
    assert.equal(pageUrl('pages/index.json'), '/');
    assert.equal(pageUrl('pages/about/team.json'), '/about/team');
  });

  it('refuses addresses that climb out of the content folder', () => {
    assert.throws(() => contentPath('/../site.config'), ToolError);
    assert.throws(() => contentPath('/about/../../x'), ToolError);
    // Not a valid content path, so treated as an address - and refused.
    assert.throws(() => contentPath('pages/../x.json'), ToolError);
  });

  it('reduces a rendered page to its title, headings and visible text', () => {
    const html =
      '<html><head><title>Tastings &amp; tours</title><style>p{}</style></head><body><h1>Book a tasting</h1><script>x()</script><p>Every Saturday.</p></body></html>';
    assert.deepEqual(pageText(html), { title: 'Tastings & tours', headings: ['Book a tasting'], text: 'Book a tasting Every Saturday.', truncated: false });
  });
});
