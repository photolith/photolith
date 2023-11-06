export function displayAlert (level, messageHTML, timeout) {
  const elAlert = document.createElement('DIV');

  elAlert.className = `alert alert-${level} alert-dismissible fade show`;
  elAlert.setAttribute('role', 'alert');
  elAlert.innerHTML = [
    messageHTML,
    '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>'
  ].join('\n');
  document.getElementById('alert-container').append(elAlert);

  if (timeout === undefined) timeout = 5000;
  if (timeout > 0) {
    window.setTimeout(() => {
      if (elAlert.isConnected) new window.bootstrap.Alert(elAlert).close();
    }, timeout);
  }
}
