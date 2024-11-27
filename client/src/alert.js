export function displayAlert (level, messageHTML, timeout) {
  const elAlert = document.createElement('DIV');
  const elContainer = document.getElementById('alert-container');
  const curTime = Math.floor(Date.now() / 1000);

  // If we haven't shown any new alerts for a while, clear out old ones
  if (elContainer.phLastAlert && curTime - elContainer.phLastAlert > 10) {
    Array.from(elContainer.children).forEach((elAlert) => {
      if (elAlert.isConnected) new window.bootstrap.Alert(elAlert).close();
    });
  }
  elContainer.phLastAlert = curTime;

  elAlert.className = `alert alert-${level} alert-dismissible fade show`;
  elAlert.setAttribute('role', 'alert');
  elAlert.innerHTML = [
    messageHTML,
    '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>'
  ].join('\n');
  elAlert.addEventListener('mousedown', (event) => {
    if (elAlert.displayAlertTimeout) {
      window.clearTimeout(elAlert.displayAlertTimeout);
      elAlert.displayAlertTimeout = undefined;
    }
  });
  elAlert.addEventListener('focusin', (event) => {
    if (elAlert.displayAlertTimeout) {
      window.clearTimeout(elAlert.displayAlertTimeout);
      elAlert.displayAlertTimeout = undefined;
    }
  });
  elContainer.append(elAlert);

  if (timeout === undefined) timeout = 5000;
  if (timeout > 0) {
    elAlert.displayAlertTimeout = window.setTimeout(() => {
      if (elAlert.isConnected) new window.bootstrap.Alert(elAlert).close();
    }, timeout);
  }
}
