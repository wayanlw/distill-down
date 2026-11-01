# Chrome Web Store listing: Distill Down

Fields are copy-ready. Limits are the store's. Nothing here has been submitted.

## Title (from manifest, max 75)
Distill Down: tabs to clean Markdown

## Summary (max 132, same as manifest description)
Turn highlighted tabs into clean Markdown for your AI tools. Converted in your browser; no network requests.

## Category
Productivity

## Detailed description

Set it up once. Then highlight your tabs, click once, and paste into any AI tool.

Distill Down strips each page to its main content (no menus, footers or clutter) and turns it into clean Markdown. Several tabs become one combined document, ready to drop into a chat, a prompt or your notes. If you prefer to distil to a file, save Markdown straight to your Downloads folder.

WHY IT'S USEFUL
• One setup, then one click: choose your settings once, and every capture after that is a single click.
• Many tabs at once: select several tabs (Ctrl or Shift and click), click once, and they become one combined document.
• Clean by default: only the article or main content, so the AI reads what matters and your token budget isn't wasted on navigation.
• Just the part you need: select at least 8 words on the page and only that selection is captured.
• Your choice of output: clipboard, or a Markdown file in your Downloads folder.
• Wrap for prompts: optionally wrap the copied text in a tag you choose, such as <input>, so an AI can tell the page from your instructions.
• Links and image addresses are optional. Leave them out for tight text, or keep them when sources matter.
• Every page keeps its title and source address. Query strings and fragments are removed unless you turn on the full address.

PRIVATE BY DESIGN
Pages are converted in your browser. Distill Down has no account, no analytics, and makes no requests to any AI service. It reads only the tabs you highlight, only when you click. It makes no network requests at all.

GOOD TO KNOW
• "Clean" means page clutter is removed, not that the text is safe. A page can contain instructions aimed at an AI, including text you can't see on screen. Treat pasted web content as untrusted.

SET IT UP IN SECONDS
Open the options page to turn clipboard and download on or off and pick a folder inside Downloads. "Restore defaults" puts everything back.

Distil, distill, boil down: whichever you call it, Distill Down turns busy web pages into clean text for AI.

## Search keywords (for the description, not a field)
distill, distil, tabs to markdown, webpage to markdown, save tabs as markdown, copy tabs for ChatGPT, copy page for AI, web clipper, clean article text, reader mode to markdown

Do not put other companies' product names in the title or summary. The description mentions "AI tool" generically.

## Single-purpose statement
Converts the tabs the user highlights into clean Markdown and copies or saves the result.

## Permission justifications
- **tabs:** Finds the highlighted tabs and reads their titles and addresses.
- **scripting + host access (all sites):** Reads the content of each highlighted tab so it can be cleaned. The user can highlight any site, so the host list cannot be narrower. Runs only after the user clicks the toolbar icon.
- **downloads:** Saves the Markdown files the user requests.
- **clipboardWrite:** Copies the combined Markdown.
- **storage:** Saves the user's settings.
- **notifications:** Reports completion and skipped tabs.
- **offscreen:** Needed for clipboard writing and file creation, which a Manifest V3 service worker cannot do itself.
- **Remote code:** None. All code ships in the package.

## Privacy policy URL
Host PRIVACY.md at a public URL (for example GitHub Pages or the repository's raw page) and enter it here. [Not yet hosted.]

## Graphic assets to produce
| Asset | Size | Content |
|---|---|---|
| Store icon | 128×128 | `icons/icon128.png` |
| Screenshots (up to 5) | 1280×800 | 1. Highlighted tabs + toolbar icon. 2. Clean Markdown pasted into a chat. 3. Settings page. 4. "Converted in your browser" |
| Small promo tile | 440×280 | Logo, name, tagline |
| Marquee promo tile (optional) | 1400×560 | Same, wider |
