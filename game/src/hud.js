// The DOM HUD. It never touches the simulation: main.js pushes numbers in and reads the buy
// clicks and the play callback out. Every element it writes is looked up once here.
import { BUY_LIST } from './match.js';

const COPY = {
  start: {
    title: 'Kiln Yard',
    eyebrow: 'TACTICAL · ROUND-BASED · ONE DEFENDER',
    copy: 'A brick kiln yard at dusk. Attackers come for the kiln floor with a charge; you hold it alone. Buy between rounds, spend on accuracy, and make every burst count.',
    action: 'Deploy',
  },
  paused: {
    title: 'Kiln Yard',
    eyebrow: 'PAUSED',
    copy: 'The yard is held. Click to go back in.',
    action: 'Resume',
  },
  matchover: {
    title: 'Match over',
    eyebrow: 'FINAL SCORE',
    copy: 'The yard is quiet.',
    action: 'Play again',
  },
};

export function createHud() {
  const el = {
    overlay: document.getElementById('overlay'),
    title: document.getElementById('overlay-title'),
    eyebrow: document.querySelector('#overlay .eyebrow'),
    copy: document.getElementById('overlay-copy'),
    play: document.getElementById('play'),
    health: document.getElementById('health'),
    healthBar: document.getElementById('health-bar'),
    healthFill: document.querySelector('#health-bar span'),
    armor: document.getElementById('armor'),
    armorFill: document.querySelector('#armor-bar span'),
    money: document.getElementById('money'),
    weaponName: document.getElementById('weapon-name'),
    ammo: document.getElementById('ammo'),
    ammoMag: document.getElementById('ammo-mag'),
    ammoReserve: document.getElementById('ammo-reserve'),
    grenades: document.getElementById('grenades'),
    clock: document.getElementById('clock'),
    roundNo: document.getElementById('round-no'),
    scoreCT: document.getElementById('score-ct'),
    scoreT: document.getElementById('score-t'),
    objective: document.getElementById('objective'),
    objectiveText: document.getElementById('objective-text'),
    feed: document.getElementById('feed'),
    banner: document.getElementById('banner'),
    bannerTitle: document.getElementById('banner-title'),
    bannerSub: document.getElementById('banner-sub'),
    damage: document.getElementById('damage'),
    crosshair: document.getElementById('crosshair'),
    ticks: [
      document.querySelector('#crosshair .c-t'),
      document.querySelector('#crosshair .c-b'),
      document.querySelector('#crosshair .c-l'),
      document.querySelector('#crosshair .c-r'),
    ],
    progress: document.getElementById('progress'),
    progressLabel: document.getElementById('progress-label'),
    progressFill: document.getElementById('progress-fill'),
    buy: document.getElementById('buy'),
    buyList: document.getElementById('buy-list'),
    buyMoney: document.getElementById('buy-money'),
  };

  const last = {};
  let bannerTimer = 0;
  let damageTimer = 0;
  let crosshairTimer = 0;
  let buyHandler = null;
  let feedRows = [];

  function setText(node, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  // The buy menu is built once and then only competes for the money line, so a click never
  // rebuilds the DOM under the pointer.
  for (const item of BUY_LIST) {
    const row = document.createElement('li');
    row.dataset.id = item.id;
    row.innerHTML = `<kbd>${item.key}</kbd><span><span class="item-name">${item.label}</span><span class="item-note">${item.note}</span></span><span class="price">$${item.price}</span><span class="owned-tag"></span>`;
    row.addEventListener('click', () => { if (buyHandler) buyHandler(item.id); });
    el.buyList.appendChild(row);
  }

  return {
    onPlay(handler) {
      el.play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    setVitals(health, armor) {
      setText(el.health, 'health', String(Math.round(health)));
      setText(el.armor, 'armor', String(Math.round(armor)));
      const hp = Math.max(0, Math.min(100, health));
      if (last.hpWidth !== hp) {
        last.hpWidth = hp;
        el.healthFill.style.width = `${hp}%`;
        el.healthBar.classList.toggle('hurt', hp <= 35);
      }
      const ar = Math.max(0, Math.min(100, armor));
      if (last.arWidth !== ar) {
        last.arWidth = ar;
        el.armorFill.style.width = `${ar}%`;
      }
    },
    setWallet(money) {
      setText(el.money, 'money', `$${Math.round(money)}`);
    },
    setWeapon(name, mag, reserve, grenades, grenadeHint) {
      setText(el.weaponName, 'weapon', name);
      setText(el.ammoMag, 'mag', String(mag));
      setText(el.ammoReserve, 'reserve', `/ ${reserve}`);
      el.ammo.classList.toggle('empty', mag === 0);
      const ragHint = grenadeHint && grenades > 0 ? ' · G to throw' : grenades === 0 ? ' · none left' : '';
      setText(el.grenades, 'grenades', `FRAG ${grenades}${ragHint}`);
    },
    setClock(seconds, planted) {
      const total = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(total / 60);
      const ss = total % 60;
      setText(el.clock, 'clock', planted ? `0:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`);
      el.clock.classList.toggle('low', total <= 20);
      el.clock.style.color = planted ? 'var(--accent)' : '';
    },
    setScore(ct, t, round) {
      setText(el.scoreCT, 'sct', String(ct));
      setText(el.scoreT, 'st', String(t));
      setText(el.roundNo, 'round', String(round));
    },
    setObjective(text, planted) {
      setText(el.objectiveText, 'objective', text);
      if (last.planted !== planted) {
        last.planted = planted;
        el.objective.classList.toggle('planted', planted);
      }
    },
    clearFeed() {
      for (const row of feedRows) row.remove();
      feedRows = [];
    },
    pushFeed(text) {
      const row = document.createElement('div');
      row.innerHTML = text;
      el.feed.appendChild(row);
      feedRows.push(row);
      while (feedRows.length > 5) {
        const old = feedRows.shift();
        old.remove();
      }
      setTimeout(() => {
        row.style.transition = 'opacity 300ms';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 320);
      }, 3600);
    },
    setSpread(pixels) {
      const offset = Math.max(4, Math.min(26, pixels));
      el.ticks[0].style.top = `${30 - 9 - offset}px`;
      el.ticks[0].style.left = '29px';
      el.ticks[1].style.top = `${30 + offset}px`;
      el.ticks[1].style.left = '29px';
      el.ticks[2].style.left = `${30 - 9 - offset}px`;
      el.ticks[2].style.top = '29px';
      el.ticks[3].style.left = `${30 + offset}px`;
      el.ticks[3].style.top = '29px';
    },
    hitMarker(killed) {
      el.crosshair.classList.add(killed ? 'kill' : 'hit');
      clearTimeout(crosshairTimer);
      crosshairTimer = setTimeout(() => el.crosshair.classList.remove('hit', 'kill'), killed ? 220 : 110);
    },
    flashDamage() {
      el.damage.style.opacity = '0.85';
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => { el.damage.style.opacity = '0'; }, 90);
    },
    showProgress(label, ratio) {
      el.progress.classList.add('on');
      setText(el.progressLabel, 'progressLabel', label);
      el.progressFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    },
    hideProgress() {
      el.progress.classList.remove('on');
    },
    showBanner(title, sub, kind) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.banner.className = `on ${kind ?? ''}`;
      clearTimeout(bannerTimer);
    },
    hideBanner() {
      el.banner.className = '';
    },
    showBuy(money, owned, hasArmor, hasKit, grenadeCount) {
      el.buy.hidden = false;
      // A round banner behind the buy card reads as two screens fighting; the menu owns the frame.
      el.banner.className = '';
      setText(el.buyMoney, 'buyMoney', `$${Math.round(money)}`);
      for (const row of el.buyList.children) {
        const item = BUY_LIST.find((entry) => entry.id === row.dataset.id);
        const isOwned = item.id === 'armor' ? hasArmor : item.id === 'defuse' ? hasKit
          : item.id === 'grenade' ? grenadeCount >= 2 : owned[item.id];
        row.classList.toggle('cant', money < item.price && !isOwned);
        row.classList.toggle('owned', Boolean(isOwned));
        row.lastElementChild.textContent = isOwned ? 'OWNED' : '';
      }
    },
    hideBuy() {
      el.buy.hidden = true;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode] ?? COPY.start;
      el.eyebrow.textContent = text.eyebrow;
      el.title.textContent = text.title;
      el.copy.textContent = mode === 'matchover' && extra ? `${text.copy} ${extra}` : text.copy;
      el.play.textContent = text.action;
      el.overlay.hidden = false;
      el.play.focus();
    },
    hideOverlay() {
      el.overlay.hidden = true;
    },
    hideAllPanels() {
      el.overlay.hidden = true;
      el.buy.hidden = true;
      el.banner.className = '';
    },
    isBuyOpen() {
      return !el.buy.hidden;
    },
  };
}
