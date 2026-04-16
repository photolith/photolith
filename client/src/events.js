export function changeEvent (detail) {
  return new window.UIEvent('change', {
    detail: detail || 0,
    view: window,
    bubbles: true,
    cancelable: true
  });
}

/** If state is true, display warning when navigating away from page */
export function toggleUnloadWarning (state) {
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#examples
  if (!window.phBeforeUnloadListener) {
    window.phBeforeUnloadListener = (event) => {
      event.preventDefault();
      return (event.returnValue = '');
    };
    window.phBeforeUnloadListener.registered = false;
  }

  if (state && !window.phBeforeUnloadListener.registered) {
    window.addEventListener('beforeunload', window.phBeforeUnloadListener, { capture: true });
    window.phBeforeUnloadListener.registered = true;
  } else if (!state && window.phBeforeUnloadListener.registered) {
    window.removeEventListener('beforeunload', window.phBeforeUnloadListener, { capture: true });
    window.phBeforeUnloadListener.registered = false;
  }
}

/** Turn on/off beforeunload depending on dirty state of (elForm) */
export function formUnloadWarning (elForm) {
  elForm.addEventListener('change', (event) => {
    // Changing selected item / preferences shouldn't count an edit, everything else does
    if (event.target.name !== 'selection' && !event.target.classList.contains('pref')) {
      toggleUnloadWarning(true);
    }
  });
  elForm.addEventListener('submit', toggleUnloadWarning.bind(undefined, false));
  elForm.addEventListener('reset', toggleUnloadWarning.bind(undefined, false));
}
