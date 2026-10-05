// Eenvoudige lijn-iconen (24x24), kleuren via currentColor.

const svg = (body, size = 22) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  today: (s) => svg('<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/><path d="M8.5 14.5l2.2 2.2 4.8-4.8"/>', s),
  library: (s) => svg('<path d="M5 4.5h4.5v15H5zM9.5 4.5H14v15H9.5z"/><path d="M15.2 5.6l3.9-1 3.6 14.1-3.9 1z"/>', s),
  weight: (s) => svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M7.2 11a5.3 5.3 0 0 1 9.6 0z"/><path d="M12 10.6l1.6-2.4"/>', s),
  settings: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', s),
  scan: (s) => svg('<path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"/><path d="M7.5 8v8M10.5 8v8M13 8v8M16.5 8v8"/>', s),
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s),
  bolt: (s) => svg('<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z"/>', s),
  search: (s) => svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', s),
  left: (s) => svg('<path d="M15 5l-7 7 7 7"/>', s),
  right: (s) => svg('<path d="M9 5l7 7-7 7"/>', s),
  trash: (s) => svg('<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13"/>', s),
  close: (s) => svg('<path d="M6 6l12 12M18 6L6 18"/>', s),
  meal: (s) => svg('<path d="M3.5 12.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M9 9c0-2 1.5-2 1.5-4M13.5 9c0-2 1.5-2 1.5-4"/>', s),
  save: (s) => svg('<path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v5h8v-5M7.5 20.5v-6.5h9v6.5"/>', s),
  copy: (s) => svg('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>', s),
};
