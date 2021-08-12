import Font from './font.js';

const id = x => document.getElementById(x);
const canvas = id('canvas');
const openFile = id('open-file');
const startNew = id('start-new');
const previewText = id('preview-text');
const scribbleFPS = id('fps');
const ligatures = id('ligatures');
const errOut  = id('err');

const ctx = canvas.getContext('2d', { alpha: true });

openFile.addEventListener('change', async () => {
	errOut.hidden = true;
	const file = openFile.files[0];
	openFile.value = '';
	if (checkBeforeClearingFont()) {
		updateLigatures();
		try {
			font = await new Font().load(file);
		} catch (err) {
			errOut.hidden = false;
			errOut.textContent = 'Loading failed: ' + err;
			console.error(err);
		}
		updateLigatures();
	}
});
startNew.addEventListener('click', () => {
	errOut.hidden = true;
	if (checkBeforeClearingFont()) {
		font = new Font();
	}
	updateLigatures();
});
window.addEventListener('beforeunload', e => {
	if (font.numLigatures !== 0) {
		e.preventDefault();
		e.returnValue = '';
	}
});

let font = new Font();

function checkBeforeClearingFont() {
	if (font.numLigatures === 0) return true;
	return confirm('Are you sure you want to open a new file? All unsaved work will be lost.');
}

function updateLigatures() {
	
}

const brush = document.createElement('canvas');
{
	brush.width = 5;
	brush.height = 5;
	const brushCtx = brush.getContext('2d');
	brushCtx.fillRect(1, 0, 3, 5);
	brushCtx.fillRect(0, 1, 5, 3);
}

function drawPoint(x, y) {
	ctx.drawImage(brush, x - 3, y - 3);
}

function drawLine(startX, startY, offX, offY) {
	if (offX === 0 && offY === 0) {
		drawPoint(startX, startY);
		return;
	}
	const numPoints = Math.max(Math.abs(offX), Math.abs(offY));
	for (let i = 0; i < numPoints; i++) {
		const t = i / numPoints;
		const x = startX + t * offX;
		const y = startY + t * offY;
		drawPoint(x, y);
	}
}

canvas.addEventListener('mousedown', e => {
	if (e.button === 0) {
		const x = Math.round(e.offsetX / canvas.clientWidth * canvas.width);
		const y = Math.round(e.offsetY / canvas.clientHeight * canvas.height);
		drawPoint(x, y);
		e.preventDefault();
	}
});
canvas.addEventListener('mousemove', e => {
	if (e.buttons & 1) {
		const x = Math.round(e.offsetX / canvas.clientWidth * canvas.width);
		const y = Math.round(e.offsetY / canvas.clientHeight * canvas.height);
		const offX = -Math.round(e.movementX / canvas.clientWidth * canvas.width);
		const offY = -Math.round(e.movementY / canvas.clientHeight * canvas.height);
		drawLine(x, y, offX, offY);
		e.preventDefault();
	}
});
