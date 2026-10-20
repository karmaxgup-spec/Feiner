// st-camera-attach: clicking SillyTavern's built-in "Attach a file" opens an
// in-page camera instead of the file picker. Photos go straight into the normal
// attach flow and are never written to the phone's gallery.
// No buttons are added to the UI. The camera screen has a "Files" link to get
// the normal file picker back when you need it.
(() => {
    const OVERLAY_ID = 'st_cam_attach_overlay';

    let stream = null;
    let imageCapture = null;
    let facing = 'environment';
    let torchOn = false;
    let bypass = false;

    function getInput() {
        return document.getElementById('file_form_input');
    }

    function attachFile(file) {
        const input = getInput();
        if (!input) {
            toastr.error('Attach input (#file_form_input) not found');
            return;
        }
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function openNormalPicker() {
        const input = getInput();
        if (!input) return;
        bypass = true;
        try { input.click(); } finally { bypass = false; }
    }

    function stopStream() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        imageCapture = null;
        torchOn = false;
    }

    function closeOverlay() {
        stopStream();
        document.getElementById(OVERLAY_ID)?.remove();
    }

    async function startStream(video, overlay) {
        stopStream();
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: facing },
                width: { ideal: 2560 },
                height: { ideal: 1440 },
            },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        if (typeof ImageCapture !== 'undefined') {
            try { imageCapture = new ImageCapture(track); } catch { imageCapture = null; }
        }
        setupControls(track, overlay);
    }

    function setupControls(track, overlay) {
        const caps = track.getCapabilities ? track.getCapabilities() : {};

        const flashBtn = overlay.querySelector('[data-act="flash"]');
        flashBtn.style.display = caps.torch ? 'flex' : 'none';
        flashBtn.style.background = 'rgba(255,255,255,0.15)';

        const zoomWrap = overlay.querySelector('[data-role="zoomwrap"]');
        const zoom = overlay.querySelector('input[data-role="zoom"]');
        if (caps.zoom) {
            zoom.min = caps.zoom.min;
            zoom.max = caps.zoom.max;
            zoom.step = caps.zoom.step || 0.1;
            zoom.value = track.getSettings().zoom || caps.zoom.min;
            zoomWrap.style.display = 'flex';
            zoom.oninput = () => {
                track.applyConstraints({ advanced: [{ zoom: Number(zoom.value) }] }).catch(() => {});
            };
        } else {
            zoomWrap.style.display = 'none';
        }
    }

    async function toggleTorch(overlay) {
        const track = stream?.getVideoTracks()[0];
        if (!track) return;
        torchOn = !torchOn;
        try {
            await track.applyConstraints({ advanced: [{ torch: torchOn }] });
            overlay.querySelector('[data-act="flash"]').style.background =
                torchOn ? 'rgba(255,214,0,0.9)' : 'rgba(255,255,255,0.15)';
        } catch {
            torchOn = false;
            toastr.error('Flash not available');
        }
    }

    async function snap(video) {
        let blob = null;

        if (imageCapture) {
            try { blob = await imageCapture.takePhoto(); } catch { blob = null; }
        }

        if (!blob) {
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (!w || !h) return;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(video, 0, 0, w, h);
            blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
        }
        if (!blob) return;

        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
        closeOverlay();
        attachFile(file);
    }

    async function openCamera() {
        if (document.getElementById(OVERLAY_ID)) return;

        const circle = 'all:unset;box-sizing:border-box;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;';

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;';
        overlay.innerHTML = `
            <video playsinline muted style="flex:1;min-height:0;width:100%;object-fit:contain;background:#000;"></video>
            <button type="button" data-act="files"
                style="all:unset;position:absolute;top:calc(14px + env(safe-area-inset-top));left:16px;padding:8px 14px;border-radius:18px;background:rgba(0,0,0,0.55);color:#fff;font-size:15px;cursor:pointer;">Files</button>
            <div data-role="zoomwrap" style="display:none;align-items:center;gap:10px;padding:10px 24px;background:#000;color:#fff;">
                <span>&#8722;</span>
                <input data-role="zoom" type="range" style="flex:1;">
                <span>+</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 28px calc(20px + env(safe-area-inset-bottom));background:#000;">
                <button type="button" data-act="cancel" aria-label="Cancel" style="${circle}">&#10005;</button>
                <button type="button" data-act="flash" aria-label="Flash" style="${circle}display:none;">&#9889;</button>
                <button type="button" data-act="snap" aria-label="Take photo"
                    style="all:unset;box-sizing:border-box;width:76px;height:76px;min-width:76px;min-height:76px;border-radius:50%;background:#fff;border:5px solid #000;box-shadow:0 0 0 4px #fff;cursor:pointer;"></button>
                <button type="button" data-act="flip" aria-label="Flip camera" style="${circle}font-size:24px;">&#8635;</button>
            </div>`;
        document.body.appendChild(overlay);

        const video = overlay.querySelector('video');
        overlay.addEventListener('click', async (e) => {
            const act = e.target?.dataset?.act;
            if (act === 'cancel') closeOverlay();
            else if (act === 'files') { closeOverlay(); openNormalPicker(); }
            else if (act === 'snap') snap(video);
            else if (act === 'flash') toggleTorch(overlay);
            else if (act === 'flip') {
                facing = facing === 'environment' ? 'user' : 'environment';
                try { await startStream(video, overlay); } catch { toastr.error('Could not switch camera'); }
            }
        });

        try {
            await startStream(video, overlay);
        } catch (err) {
            console.error('[st-camera-attach]', err);
            closeOverlay();
            toastr.error('Camera unavailable or permission denied. Opening the file picker.');
            openNormalPicker();
        }
    }

    // Intercept the built-in attach: it ends in a click on the hidden file input.
    document.addEventListener('click', (e) => {
        if (e.target?.id !== 'file_form_input' || bypass) return;
        // No secure context means no live camera: let the normal picker open.
        if (!navigator.mediaDevices?.getUserMedia) return;
        e.preventDefault();
        e.stopPropagation();
        openCamera();
    }, true);
})();
