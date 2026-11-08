/* Waitlist form: posts the answers to the workshop-signup Edge Function. */
(function () {
  var form = document.getElementById('workshopForm');
  if (!form) return;

  var ENDPOINT = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/workshop-signup';
  // Public publishable key, the same one the shop uses. It is safe in the browser.
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';
  var status = form.querySelector('.form-status');
  var button = form.querySelector('button[type="submit"]');
  var done = document.getElementById('workshopDone');

  function checked(name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) { return el.value; });
  }

  // "Join with this kit" on a kit card pre-selects that kit in the form.
  Array.prototype.forEach.call(document.querySelectorAll('[data-pick-kit]'), function (link) {
    link.addEventListener('click', function () {
      var radio = form.querySelector('input[name="kit"][value="' + link.getAttribute('data-pick-kit') + '"]');
      if (radio) radio.checked = true;
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    status.textContent = '';

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    if (checked('days').length === 0) {
      status.textContent = 'Please choose at least one day you are available.';
      return;
    }

    var data = {
      full_name: form.full_name.value,
      email: form.email.value,
      mobile: form.mobile.value,
      experience: checked('experience')[0] || '',
      motivation: form.motivation.value,
      days: checked('days'),
      kit: checked('kit')[0] || '',
      notes: form.notes.value,
      terms_accepted: form.terms_accepted.checked,
      terms_version: form.terms_version.value,
      website: form.website.value
    };

    button.disabled = true;
    status.textContent = 'Sending your answers...';

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
      body: JSON.stringify(data)
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          return { ok: response.ok, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body.ok) {
          form.hidden = true;
          done.hidden = false;
          done.focus();
          return;
        }
        status.textContent = result.body.error || 'Something went wrong. Please try again.';
        button.disabled = false;
      })
      .catch(function () {
        status.textContent = 'We could not send your answers just now. Please try again, or WhatsApp us.';
        button.disabled = false;
      });
  });
})();
