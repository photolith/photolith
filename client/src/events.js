export function changeEvent (detail) {
  return new window.UIEvent('change', {
    detail: detail || 0,
    view: window,
    bubbles: true,
    cancelable: true
  });
}
