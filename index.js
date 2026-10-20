// st-camera-attach: one-tap camera + gallery buttons in the send bar.
// The camera is an in-page live preview (getUserMedia). Photos go straight into
// SillyTavern's attach flow and are never written to the phone's gallery.
(() => {
    const CAM_ID = 'st_cam_attach_camera';
    const GAL_ID = 'st_cam_attach_gallery';
    const OVERLAY_ID = 'st_cam_attach_overlay';

    let stream = null;
    let imageCapture = null;
    let facing = 'environment';
    let torchOn = false;

    function attachFile(file) {
        const input = document.getElementById('file_form_input');
        if (!input) {
            toastr.error('Attach input (#file_form_input) not found');
            return;
        }
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
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

        // Full-resolution still if the browser supports it.
        if (imageCapture) {
            try { blob = await imageCapture.takePhoto(); } catch { blob = null; }
        }

        // Fallback: grab the current video frame.
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

    // Used for the gallery button, and as a camera fallback on non-secure pages.
    function pickFile(useCapture) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (useCapture) input.setAttribute('capture', 'environment');
        input.onchange = () => {
            if (input.files && input.files[0]) attachFile(input.files[0]);
        };
        input.click();
    }

    async function openCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            toastr.warning('Live camera needs HTTPS or localhost. Using the file picker instead.');
            pickFile(true);
            return;
        }

        const circle = 'all:unset;box-sizing:border-box;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.15);color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;';

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;';
        overlay.innerHTML = `
            <video playsinline muted style="flex:1;min-height:0;width:100%;object-fit:contain;background:#000;"></video>
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
            toastr.error('Camera unavailable or permission denied');
        }
    }

    function addButtons() {
        if (document.getElementById(CAM_ID)) return;
        const bar = document.getElementById('leftSendForm');
        if (!bar) return;

        const cam = document.createElement('div');
        cam.id = CAM_ID;
        cam.className = 'fa-solid fa-camera interactable';
        cam.title = 'Take a photo (not saved to gallery)';
        cam.tabIndex = 0;
        cam.addEventListener('click', openCamera);

        const gal = document.createElement('div');
        gal.id = GAL_ID;
        gal.className = 'fa-solid fa-image interactable';
        gal.title = 'Pick from gallery';
        gal.tabIndex = 0;
        gal.addEventListener('click', () => pickFile(false));

        bar.appendChild(cam);
        bar.appendChild(gal);
    }

    jQuery(() => addButtons());
})();
