<?php
defined('MOODLE_INTERNAL') || die();

/**
 * Serve files uploaded via `local_italiciamcp_upload_file` from the
 * course context's `local_italiciamcp / media` filearea.
 *
 * Enrolled users and managers of the course see the files inline.
 *
 * @param stdClass $course
 * @param stdClass $cm
 * @param context $context
 * @param string $filearea
 * @param array $args [itemid, filepath...], filename]
 * @param bool $forcedownload
 * @param array $options
 * @return bool
 */
function local_italiciamcp_pluginfile(
    $course,
    $cm,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    if ($filearea !== 'media') {
        return false;
    }

    require_login($course);

    // args: [itemid, filepath...] filename
    $itemid = array_shift($args);
    $filename = array_pop($args);
    $filepath = $args ? '/' . implode('/', $args) . '/' : '/';

    $fs = get_file_storage();
    $file = $fs->get_file(
        $context->id,
        'local_italiciamcp',
        'media',
        $itemid,
        $filepath,
        $filename
    );
    if (!$file || $file->is_directory()) {
        send_file_not_found();
    }

    // Default: serve inline for 24 hours of client-side cache.
    send_stored_file($file, 86400, 0, $forcedownload, $options);
}

/**
 * Inject qbank edit-form interceptor on any /question/* URL.
 *
 * Workaround for Moodle 5.0.2 bug where qbank edit form submits
 * return 200 OK but the question row is never updated. Our JS
 * replaces the form submit with a call to
 * `local_italiciamcp_update_question_simple`, which writes the
 * question row directly.
 */
function local_italiciamcp_before_standard_top_of_body_html() {
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    if (strpos($uri, '/question/') === false) {
        return '';
    }

    $sesskey = sesskey();
    $js = <<<JS
<script>
(function(){
  if (!/\\/question\\/bank\\/editquestion\\/question\\.php/.test(location.pathname)) return;
  document.addEventListener('DOMContentLoaded', function(){
    var form = document.querySelector('form[id^="mform"]');
    if (!form) return;
    var qidInput = form.querySelector('input[name="id"]');
    if (!qidInput || !qidInput.value) return;
    var courseid = new URLSearchParams(location.search).get('courseid')
                || (form.querySelector('input[name="courseid"]')||{}).value;
    if (!courseid) return;
    form.addEventListener('submit', function(ev){
      var submitter = ev.submitter || {};
      if (/(cancel|back|continue|default)/i.test(submitter.name || '')) return;
      if (window._italiciamcp_saving) return;
      ev.preventDefault();
      ev.stopPropagation();
      window._italiciamcp_saving = true;
      var qid = qidInput.value;
      var name = (form.querySelector('[name="name"]')||{}).value || '';
      var qt = (form.querySelector('textarea[name="questiontext[text]"]')
             || form.querySelector('[name="questiontext[text]"]'))||{};
      var qtext = qt.value || '';
      var answers = [];
      var i = 0;
      while (form.querySelector('[name="answer['+i+'][text]"]')) {
        var a = form.querySelector('[name="answer['+i+'][text]"]').value || '';
        var fElem = form.querySelector('textarea[name="feedback['+i+'][text]"]')
                 || form.querySelector('[name="feedback['+i+'][text]"]');
        var f = fElem ? (fElem.value || '') : '';
        var frElem = form.querySelector('[name="fraction['+i+']"]');
        var fr = frElem ? parseFloat(frElem.value) : -999;
        if (isNaN(fr)) fr = -999;
        answers.push({index:i, answer:a, feedback:f, fraction:fr});
        i++;
      }
      var payload = [{index:0, methodname:'local_italiciamcp_update_question_simple',
        args:{courseid:parseInt(courseid), question_id:parseInt(qid),
              name:name, questiontext:qtext, answers:answers}}];
      fetch('/lib/ajax/service.php?sesskey={$sesskey}&info=local_italiciamcp_update_question_simple', {
        method:'POST', headers:{'Content-Type':'application/json'},
        credentials:'same-origin', body: JSON.stringify(payload)
      }).then(function(r){return r.json();}).then(function(out){
        if (out && out[0] && out[0].error) {
          window._italiciamcp_saving = false;
          alert('[italiciamcp] Save failed: '+(out[0].exception && out[0].exception.message || JSON.stringify(out[0])));
          return;
        }
        var banner = document.createElement('div');
        banner.style.cssText='position:fixed;top:10px;right:10px;padding:10px 16px;background:#198754;color:#fff;border-radius:4px;z-index:99999;font-weight:bold;';
        banner.textContent='Pregunta guardada via italiciamcp ✓';
        document.body.appendChild(banner);
        setTimeout(function(){
          var back = document.referrer && /question\\/edit\\.php|question\\/bank/.test(document.referrer)
            ? document.referrer
            : '/question/edit.php?courseid='+courseid;
          location.href = back;
        }, 900);
      }).catch(function(e){
        window._italiciamcp_saving = false;
        alert('[italiciamcp] Network error: '+e);
      });
    }, true);
  });
})();
</script>
JS;
    return $js;
}
