/**
 * Web Audio API synthesizer for the Body Image Mirror application.
 * Generates custom electronic sound effects completely client-side without assets.
 */
class AudioSynth {
  private ctx: AudioContext | null = null;
  private volume: number = 0.5; // Default volume (0.0 to 1.0)
  private isMuted: boolean = false;

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
  }

  /**
   * Toggle mute state
   */
  public setMute(muted: boolean) {
    this.isMuted = muted;
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
}

export const audioSynth = new AudioSynth();
