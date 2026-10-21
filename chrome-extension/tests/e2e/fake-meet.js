window.pageKeys = 0;
for (const t of ['keydown', 'keyup', 'keypress']) window.addEventListener(t, () => { window.pageKeys += 1; }, true);
document.getElementById('sendbtn').addEventListener('click', () => {
  const box = document.getElementById('chatbox');
  if (!box.value.trim()) return;
  const li = document.createElement('li'); li.textContent = box.value; document.getElementById('log').appendChild(li); box.value = '';
});

// ---- captions fixture (structure ASSUMED from public Meet-caption scrapers; this is NOT real Meet markup) ----
// Region labelled "Captions"; one row per speaker turn: avatar <img>, speaker name, caption text. Rows are updated in
// place, like Meet does while someone is still talking.
const capRows = [];
let capRegion = null;
const ccbtn = document.getElementById('ccbtn');
function renderCaps() {
  if (!capRegion) return;
  const list = capRegion.firstChild;
  while (list.children.length < capRows.length) {
    const row = document.createElement('div'); row.className = 'caprow';
    const img = document.createElement('img'); img.alt = ''; img.setAttribute('data-iml', '1');
    const box = document.createElement('div'); const name = document.createElement('div'); const text = document.createElement('div');
    name.className = 'name'; text.className = 'text'; box.append(name, text); row.append(img, box); list.appendChild(row);
  }
  while (list.children.length > capRows.length) list.lastChild.remove();
  capRows.forEach((r, i) => { const row = list.children[i]; row.querySelector('.name').textContent = r.speaker; row.querySelector('.text').textContent = r.text; });
}
ccbtn.addEventListener('click', () => {
  if (capRegion) { capRegion.remove(); capRegion = null; ccbtn.setAttribute('aria-label', 'Turn on captions'); return; }
  capRegion = document.createElement('div'); capRegion.setAttribute('role', 'region'); capRegion.setAttribute('aria-label', 'Captions');
  capRegion.appendChild(document.createElement('div'));
  document.getElementById('caphost').appendChild(capRegion);
  ccbtn.setAttribute('aria-label', 'Turn off captions');
  renderCaps();
});
window.__setCaptions = (rows) => { capRows.splice(0, capRows.length, ...rows); renderCaps(); };
window.__breakCaptionLayout = () => { if (capRegion) capRegion.querySelectorAll('img').forEach((i) => i.remove()); };
