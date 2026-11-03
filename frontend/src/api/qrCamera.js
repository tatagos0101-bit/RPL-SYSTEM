// Own the stream so even permission prompts resolved after cancellation are cleaned up.
export function createQrCamera({ mediaDevices, loadDecoder, video, onResult, onDevices }) {
  let cancelled = false;
  let stream;
  let controls;
  const stop = () => {
    cancelled = true;
    controls?.stop();
    stream?.getTracks().forEach(track => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };
  const start = async deviceId => {
    try {
      const { BrowserQRCodeReader } = await loadDecoder();
      if (cancelled) return;
      stream = await mediaDevices.getUserMedia({ audio: false, video: deviceId
        ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } } });
      if (cancelled) { stop(); return; }
      const devices = await mediaDevices.enumerateDevices();
      if (cancelled) { stop(); return; }
      onDevices(devices.filter(device => device.kind === 'videoinput'));
      controls = await new BrowserQRCodeReader().decodeFromStream(stream, video, result => {
        if (!cancelled && result) onResult(result.getText());
      });
      if (cancelled) stop();
    } catch (error) { stop(); throw error; }
  };
  return { start, stop };
}
