import { Injectable, signal, effect, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class FontSizeService {
  private readonly STORAGE_KEY = 'elms_font_scale';
  private readonly MIN_SCALE = 0.8;
  private readonly MAX_SCALE = 1.4;
  private readonly STEP = 0.1;

  // Signal to track the current scale (1.0 = 100%)
  scale = signal<number>(1.0);

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      const savedScale = localStorage.getItem(this.STORAGE_KEY);
      if (savedScale) {
        this.scale.set(parseFloat(savedScale));
      }

      // Automatically apply scale whenever it changes
      effect(() => {
        this.applyScale(this.scale());
      });
    }
  }

  increase() {
    if (this.scale() < this.MAX_SCALE) {
      this.scale.update(s => parseFloat((s + this.STEP).toFixed(1)));
      this.save();
    }
  }

  decrease() {
    if (this.scale() > this.MIN_SCALE) {
      this.scale.update(s => parseFloat((s - this.STEP).toFixed(1)));
      this.save();
    }
  }

  reset() {
    this.scale.set(1.0);
    this.save();
  }

  private save() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.STORAGE_KEY, this.scale().toString());
    }
  }

  private applyScale(scaleFactor: number) {
    if (isPlatformBrowser(this.platformId)) {
      // Calculate font size (14px is the base from styles.css)
      const baseSize = 14;
      const newSize = baseSize * scaleFactor;
      document.documentElement.style.fontSize = `${newSize}px`;
    }
  }
}
