/* bas-ems — boot + RAF loop
 * Classic script -> runs on DOMContentLoaded. Loaded LAST (after all modules).
 */
window.BAS = window.BAS || {};
(function (BAS) {
  'use strict';

  function boot() {
    BAS.sim.init();
    var root = document.getElementById('app');
    BAS.app.build(root);

    var clock = BAS.clock;
    function frameLoop() {
      var t = clock.now();
      var frame = BAS.sim.frame(t);
      BAS.app.update(frame);
      requestAnimationFrame(frameLoop);
    }
    requestAnimationFrame(frameLoop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.BAS);
