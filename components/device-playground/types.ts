export interface DeviceState {
  id: string;
  label: string;
  isOwner: boolean;
  matchable: boolean;
  matchScore: number;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PlaygroundSize {
  width: number;
  height: number;
}

export interface LedConfig {
  color: string;
  minDuration: number;
  maxDuration: number;
}
