// The readout: vitals, ammunition, the wave counter, the score, the kill line, the call-out and
// the two sheets. Every write goes through one function per element so a frame never touches the
// DOM it did not change — with eight attackers on the field that is the difference between 60 fps
// and a stutter.

export function createReadout() {
  const el = {
    wave: document.querySelector('#campaign .wave'),
    left: document.querySelector('#campaign .left'),
    score: document.querySelector('#tally .score'),
    dispatch: document.querySelector('#dispatch'),
    callout: document.querySelector('#callout'),
    headline: document.querySelector('#callout .headline'),
    sub: document.querySelector('#callout .sub'),
    sight: document.querySelector('#sight'),
    healthValue: document.querySelector('#health-value'),
    healthBar: document.querySelector('#health-bar > i'),
    healthGauge: document.querySelector('#health-gauge'),
    armourValue: document.querySelector('#armour-value'),
    gunName: document.querySelector('#gun-name'),
    ammoNow: document.querySelector('#ammo-now'),
    ammoMax: document.querySelector('#ammo-max'),
    ammoBlock: document.querySelector('#ammo'),
    titleSheet: document.querySelector('#title-sheet'),
    reportSheet: document.querySelector('#report-sheet'),
    reportEyebrow: document.querySelector('#report-eyebrow'),
    reportTitle: document.querySelector('#report-title'),
    reportLine: document.querySelector('#report-line'),
    reportWaves: document.querySelector('#report-waves'),
    reportScore: document.querySelector('#report-score'),
    reportKills: document.querySelector('#report-kills'),
    reportHeads: document.querySelector('#report-heads'),
    begin: document.querySelector('#begin'),
    again: document.querySelector('#again'),
  };

  const shown = {
    health: -1, armour: -1, ammo: -1, max: -1, score: -1, wave: -1, left: -1, reloading: null,
  };

  let calloutTimer = 0;
  let hitTimer = 0;

  function setVitals(health, armour) {
    const roundedHealth = Math.max(0, Math.round(health));
    if (roundedHealth !== shown.health) {
      shown.health = roundedHealth;
      el.healthValue.textContent = String(roundedHealth);
      el.healthBar.style.width = `${Math.max(0, Math.min(100, roundedHealth))}%`;
      el.healthBar.parentElement.classList.toggle('low', roundedHealth <= 34);
      el.healthGauge.classList.toggle('hurt', roundedHealth <= 34);
    }
    const roundedArmour = Math.max(0, Math.round(armour));
    if (roundedArmour !== shown.armour) {
      shown.armour = roundedArmour;
      el.armourValue.textContent = String(roundedArmour);
    }
  }

  function setAmmo(now, max, reloading) {
    if (now !== shown.ammo) {
      shown.ammo = now;
      el.ammoNow.textContent = String(now);
    }
    if (max !== shown.max) {
      shown.max = max;
      el.ammoMax.textContent = String(max);
    }
    if (reloading !== shown.reloading) {
      shown.reloading = reloading;
      el.ammoBlock.classList.toggle('reloading', reloading);
    }
  }

  function gunLabel(name) {
    if (el.gunName.textContent !== name) el.gunName.textContent = name;
  }

  function setScore(score) {
    if (score !== shown.score) {
      shown.score = score;
      el.score.textContent = String(score);
    }
  }

  function setWave(wave, left) {
    if (wave !== shown.wave) {
      shown.wave = wave;
      el.wave.textContent = `WAVE ${wave}`;
    }
    if (left !== shown.left) {
      shown.left = left;
      el.left.textContent = `${left} of the wave left`;
    }
  }

  // The kill line: newest on top, oldest dropped once it is off the list.
  function dispatch(text, seconds = 3.4) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = text;
    el.dispatch.prepend(row);
    while (el.dispatch.children.length > 5) el.dispatch.lastElementChild.remove();
    window.setTimeout(() => row.remove(), seconds * 1000);
  }

  function callout(headline, sub, seconds = 2.0) {
    el.headline.textContent = headline;
    el.sub.textContent = sub;
    el.callout.classList.add('on');
    calloutTimer = seconds;
  }

  function hitMarker() {
    el.sight.classList.add('hit');
    hitTimer = 0.09;
  }

  // Called once a frame with the real delta, so the call-out and the hit marker expire on time.
  function tick(dt) {
    if (calloutTimer > 0) {
      calloutTimer -= dt;
      if (calloutTimer <= 0) el.callout.classList.remove('on');
    }
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) el.sight.classList.remove('hit');
    }
  }

  function showTitle(on) {
    el.titleSheet.hidden = !on;
  }

  function showReport(report) {
    el.reportEyebrow.textContent = 'after action';
    el.reportTitle.textContent = 'The yard fell';
    el.reportLine.textContent = report.line;
    el.reportWaves.textContent = String(report.waves);
    el.reportScore.textContent = String(report.score);
    el.reportKills.textContent = String(report.kills);
    el.reportHeads.textContent = String(report.heads);
    el.reportSheet.hidden = false;
  }

  function hideReport() {
    el.reportSheet.hidden = true;
  }

  function onBegin(fn) {
    el.begin.addEventListener('click', fn);
  }

  function onAgain(fn) {
    el.again.addEventListener('click', fn);
  }

  return {
    setVitals, setAmmo, gunLabel, setScore, setWave, dispatch, callout, hitMarker,
    tick, showTitle, showReport, hideReport, onBegin, onAgain, el,
  };
}
