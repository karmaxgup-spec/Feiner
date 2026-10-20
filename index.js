// st-camera-attach: one-tap camera + gallery buttons in the send bar.
// Camera uses an in-page live preview (getUserMedia) and captures to a canvas,
// so the photo is never written to the phone's gallery.
(() => {
    const CAM_ID = 'st_cam_attach_camera';
    const GAL_ID = 'st_cam_attach_gallery';
    const OVERLAY_ID = 'st_cam_attach_overlay';

    let stream = null;
    let facing = 'environment';

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
    }

    function closeOverlay() {
        stopStream();
        document.getElementById(OVERLAY_ID)?.remove();
    }

    async function startStream(video) {
        stopStream();
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing } },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();
    }

    function snap(video) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        canvas.toBlob(blob => {
            if (!blob) return;
            const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            closeOverlay();
            attachFile(file);
        }, 'image/jpeg', 0.9);
    }

    // Fallback when the page isn't a secure context (plain http over LAN).
    // The native camera app may save a copy to the gallery in this mode.
    function fallbackCapture() {
        toastr.warning('Live camera needs HTTPS. Using the camera app instead (it may save to your gallery).');
        pickFile(true);
    }

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
            fallbackCapture();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;';
        overlay.innerHTML = `
            <video playsinline muted style="flex:1;min-height:0;width:100%;object-fit:contain;background:#000;"></video>
            <div style="display:flex;justify-content:space-around;align-items:center;padding:16px;background:#111;">
                <button type="button" data-act="cancel" style="font-size:18px;padding:12px 18px;">Cancel</button>
                <button type="button" data-act="snap" style="font-size:18px;padding:16px 28px;border-radius:50%;">&#9679;</button>
                <button type="button" data-act="flip" style="font-size:18px;padding:12px 18px;">Flip</button>
            </div>`;
        document.body.appendChild(overlay);

        const video = overlay.querySelector('video');
        overlay.addEventListener('click', async (e) => {
            const act = e.target?.dataset?.act;
            if (act === 'cancel') closeOverlay();
            else if (act === 'snap') snap(video);
            else if (act === 'flip') {
                facing = facing === 'environment' ? 'user' : 'environment';
                try { await startStream(video); } catch (err) { toastr.error('Could not switch camera'); }
            }
        });

        try {
            await startStream(video);
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
