/**
 * Web Audio API synthesizer for the Body Image Mirror application.
 * Generates custom electronic sound effects completely client-side without assets.
 */
class AudioSynth {
  private ctx: AudioContext | null = null;
  private volume: number = 0.5; // Default volume (0.0 to 1.0)
  private isMuted: boolean = false;

  // Track the continuous chord oscillators and gain node for Slow Trace Mode
  private traceOscillators: OscillatorNode[] = [];
  private traceGainNode: GainNode | null = null;
  private traceChordActive: boolean = false;

  // Track continuous drawing synthesizer for Kanji Writing Mode
  private drawOscillator: OscillatorNode | null = null;
  private drawGainNode: GainNode | null = null;
  private drawActive: boolean = false;

  constructor() {
    // Lazy initialize to bypass browser autoplay policy
  }

  /**
   * Initialize or resume the audio context.
   */
  private initContext(): AudioContext {
    if (!this.ctx) {
      // Support standard and legacy names
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    
    return this.ctx;
  }

  /**
   * Set global volume
   */
  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    try {
      const audioCtx = this.initContext();
      if (this.traceGainNode && this.traceChordActive && !this.isMuted) {
        this.traceGainNode.gain.setValueAtTime(0.08 * this.volume, audioCtx.currentTime);
      }
      if (this.drawGainNode && this.drawActive && !this.isMuted) {
        this.drawGainNode.gain.setValueAtTime(0.04 * this.volume, audioCtx.currentTime);
      }
    } catch (e) {}
  }

  /**
   * Toggle mute state
   */
  public setMute(muted: boolean) {
    this.isMuted = muted;
    try {
      const audioCtx = this.initContext();
      if (this.traceGainNode) {
        const targetGain = !this.isMuted && this.traceChordActive ? 0.08 * this.volume : 0;
        this.traceGainNode.gain.setValueAtTime(targetGain, audioCtx.currentTime);
      }
      if (this.drawGainNode) {
        const targetGain = !this.isMuted && this.drawActive ? 0.04 * this.volume : 0;
        this.drawGainNode.gain.setValueAtTime(targetGain, audioCtx.currentTime);
      }
    } catch (e) {}
  }

  /**
   * Helper to create a basic sound with standard ADSR envelope
   */
  private playTone({
    freq,
    type = 'sine',
    duration = 0.3,
    gainStart = 0.3,
    freqEnd = null,
    delay = 0
  }: {
    freq: number;
    type?: OscillatorType;
    duration?: number;
    gainStart?: number;
    freqEnd?: number | null;
    delay?: number;
  }) {
    if (this.isMuted || this.volume <= 0) return;
    
    try {
      const audioCtx = this.initContext();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
      
      if (freqEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + delay + duration);
      }

      // Dynamic volume adjusting
      const userVolume = gainStart * this.volume;
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime + delay);
      gainNode.gain.linearRampToValueAtTime(userVolume, audioCtx.currentTime + delay + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + duration);

      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + duration);
    } catch (e) {
      console.warn("Failed to play synthesized sound effect", e);
    }
  }

  /**
   * Sound effect: Warm ascending arpeggio when calibration starts
   */
  public playCalibrationStart() {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, index) => {
      this.playTone({
        freq,
        type: 'triangle',
        duration: 0.25,
        gainStart: 0.15,
        delay: index * 0.08
      });
    });
  }

  /**
   * Sound effect: Pleasant bright chime when calibration finishes successfully
   */
  public playCalibrationSuccess() {
    // Play a shiny C-major pentatonic chime
    const baseDelay = 0;
    const chimes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    
    chimes.forEach((freq, index) => {
      this.playTone({
        freq,
        type: 'sine',
        duration: 0.8,
        gainStart: 0.18,
        delay: baseDelay + index * 0.05
      });
    });
  }

  /**
   * Sound effect: Fading pitch sweep when a gesture reset is triggered
   */
  public playReset() {
    this.playTone({
      freq: 587.33, // D5
      type: 'triangle',
      duration: 0.45,
      gainStart: 0.2,
      freqEnd: 146.83 // D3
    });
  }

  /**
   * Sound effect: Pleasant double beep for goal achievements
   */
  public playGoalAchieved() {
    // Beep 1
    this.playTone({
      freq: 880, // A5
      type: 'sine',
      duration: 0.1,
      gainStart: 0.15,
      delay: 0
    });
    // Beep 2
    this.playTone({
      freq: 1320, // E6
      type: 'sine',
      duration: 0.18,
      gainStart: 0.15,
      delay: 0.08
    });
  }

  /**
   * Sound effect: Soft click feedback when joint stretches straight
   */
  public playJointClick(freq = 600) {
    this.playTone({
      freq,
      type: 'sine',
      duration: 0.08,
      gainStart: 0.08,
      delay: 0
    });
  }

  /**
   * Sound effect: Success chime when target pose is cleared
   */
  public playPoseClear() {
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
    notes.forEach((freq, index) => {
      this.playTone({
        freq,
        type: 'sine',
        duration: 0.6,
        gainStart: 0.12,
        delay: index * 0.04
      });
    });
  }

  /**
   * Start a continuous ambient major chord (C4, E4, G4, C5) for Slow Trace (Irirabou) Mode
   */
  public startTraceChord() {
    try {
      const audioCtx = this.initContext();
      this.stopTraceChord(); // safety clear
      
      this.traceGainNode = audioCtx.createGain();
      this.traceGainNode.connect(audioCtx.destination);
      
      // Start with volume 0
      this.traceGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      this.traceChordActive = false;
      
      const freqs = [261.63, 329.63, 392.00, 523.25];
      this.traceOscillators = freqs.map(freq => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.connect(this.traceGainNode!);
        osc.start(audioCtx.currentTime);
        return osc;
      });
    } catch (e) {
      console.warn("Failed to start trace chord", e);
    }
  }

  /**
   * Smoothly fade in/out the continuous trace chord
   */
  public setTraceChordActive(active: boolean) {
    this.traceChordActive = active;
    if (!this.traceGainNode) return;
    
    try {
      const audioCtx = this.initContext();
      const targetGain = active && !this.isMuted ? 0.08 * this.volume : 0;
      
      this.traceGainNode.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.15);
    } catch (e) {
      console.warn("Failed to change trace chord activity", e);
    }
  }

  /**
   * Stop and clean up the continuous trace chord oscillators
   */
  public stopTraceChord() {
    try {
      this.traceChordActive = false;
      if (this.traceOscillators.length > 0) {
        this.traceOscillators.forEach(osc => {
          try {
            osc.stop();
          } catch (e) {}
        });
        this.traceOscillators = [];
      }
      if (this.traceGainNode) {
        try {
          this.traceGainNode.disconnect();
        } catch (e) {}
        this.traceGainNode = null;
      }
    } catch (e) {
      console.warn("Failed to stop trace chord", e);
    }
  }

  /**
   * Sound effect: Soft water-droplet/pizzicato sound for trace errors
   */
  public playTraceError() {
    this.playTone({
      freq: 220, // Low pitch A3
      type: 'triangle',
      duration: 0.12,
      gainStart: 0.22,
      freqEnd: 80 // fast sliding down pitch to simulate water drop
    });
  }

  /**
   * Start continuous drawing synthesizer for Kanji mode
   */
  public startDrawingSound() {
    try {
      const audioCtx = this.initContext();
      this.stopDrawingSound(); // safety clear

      this.drawGainNode = audioCtx.createGain();
      this.drawGainNode.connect(audioCtx.destination);
      this.drawGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      this.drawActive = false;

      this.drawOscillator = audioCtx.createOscillator();
      this.drawOscillator.type = "sine";
      this.drawOscillator.frequency.setValueAtTime(330, audioCtx.currentTime); // default E4
      this.drawOscillator.connect(this.drawGainNode);
      this.drawOscillator.start(audioCtx.currentTime);
    } catch (e) {
      console.warn("Failed to start drawing sound", e);
    }
  }

  /**
   * Set drawing sound activity and frequency
   */
  public setDrawingSoundActive(active: boolean, freq = 330) {
    this.drawActive = active;
    if (!this.drawGainNode || !this.drawOscillator) return;

    try {
      const audioCtx = this.initContext();
      const targetGain = active && !this.isMuted ? 0.04 * this.volume : 0;
      
      // Smoothly ramp volume and frequency
      this.drawGainNode.gain.linearRampToValueAtTime(targetGain, audioCtx.currentTime + 0.1);
      if (active) {
        this.drawOscillator.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.08);
      }
    } catch (e) {
      console.warn("Failed to change drawing sound state", e);
    }
  }

  /**
   * Stop continuous drawing sound
   */
  public stopDrawingSound() {
    try {
      this.drawActive = false;
      if (this.drawOscillator) {
        try {
          this.drawOscillator.stop();
        } catch (e) {}
        this.drawOscillator = null;
      }
      if (this.drawGainNode) {
        try {
          this.drawGainNode.disconnect();
        } catch (e) {}
        this.drawGainNode = null;
      }
    } catch (e) {
      console.warn("Failed to stop drawing sound", e);
    }
  }

  /**
   * Sound effect: quick sci-fi sweep down when canvas is cleared
   */
  public playClapClear() {
    this.playTone({
      freq: 480,
      type: 'triangle',
      duration: 0.35,
      gainStart: 0.2,
      freqEnd: 80
    });
  }

  /**
   * Sound effect: nice success pentatonic scale sweep for Kanji completion
   */
  public playKanjiSuccess() {
    const notes = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]; // C5, D5, E5, G5, A5, C6
    notes.forEach((freq, index) => {
      this.playTone({
        freq,
        type: 'sine',
        duration: 0.5,
        gainStart: 0.1,
        delay: index * 0.06
      });
    });
  }
}

export const audioSynth = new AudioSynth();
