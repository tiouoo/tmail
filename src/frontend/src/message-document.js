import DOMPurify from 'dompurify';

// Keep email styles inside an opaque sandboxed iframe, never in the application DOM.
export function htmlDocument(html, text, images = false) {
  let styles = '';
  let body;
  if (html) {
    const document = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: true,
      RETURN_DOM: true,
      FORBID_TAGS: [
        'script', 'form', 'input', 'button', 'iframe', 'object', 'embed',
        'link', 'meta', 'base', 'video', 'audio',
      ],
      FORBID_ATTR: ['srcset', 'ping', 'autofocus'],
    });
    styles = [...document.querySelectorAll('head style')].map(node => node.outerHTML).join('');
    body = document.querySelector('body').outerHTML;
  } else {
    const escaped = String(text ?? '').replace(/[&<>]/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;'})[character]);
    body = `<body><pre>${escaped}</pre></body>`;
  }
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: ${images ? 'https:' : ''}; font-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font:15px/1.7 system-ui,sans-serif;color:#28332e;overflow-wrap:anywhere;margin:24px}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font-family:inherit}a{color:#34745b}table{max-width:100%}@media(max-width:600px){body{margin:12px}}</style>${styles}</head>${body}</html>`;
}
