window.pageKeys = 0;
for (const t of ['keydown', 'keyup', 'keypress']) window.addEventListener(t, () => { window.pageKeys += 1; }, true);
document.getElementById('sendbtn').addEventListener('click', () => {
  const box = document.getElementById('chatbox');
  if (!box.value.trim()) return;
  const li = document.createElement('li'); li.textContent = box.value; document.getElementById('log').appendChild(li); box.value = '';
});
