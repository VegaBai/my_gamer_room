export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type TrackPath = 'position' | 'quaternion' | 'scale';

export interface TrackSample {
  t: number;
  value: Vec3 | Quat;
}

export interface TransformTrack {
  nodeId: string;
  path: TrackPath;
  samples: TrackSample[];
}

export interface ControlDefinition {
  id: string;
  label: string;
  group: string;
  primary: boolean;
  min: number;
  max: number;
  default: number;
  clickValue: number;
  durationMs: number;
  unit?: '%' | '°' | 'cm';
  tracks?: TransformTrack[];
}

export interface HitTargetDefinition {
  controlId: string;
  nodeId?: string;
  center: Vec3;
  size: Vec3;
}

export interface VisualTargetDefinition {
  controlId: string;
  nodeIds: string[];
}

export interface AssetVariant {
  url: string;
  sha256?: string;
  bytes?: number;
  triangles?: number;
  drawCalls?: number;
}

export interface RoomCameraDefinition {
  position: Vec3;
  target: Vec3;
  fovDegrees?: number;
  near?: number;
  far?: number;
  minDistance: number;
  maxDistance: number;
  minPolar: number;
  maxPolar: number;
  minAzimuth: number;
  maxAzimuth: number;
}

export interface RoomManifestV1 {
  schemaVersion: 1;
  sourceBlendSha256: string;
  pipelineVersion: string;
  variants: {
    desktop: AssetVariant;
    low: AssetVariant;
  };
  camera: RoomCameraDefinition;
  controls: ControlDefinition[];
  hitTargets: HitTargetDefinition[];
  visualTargets: VisualTargetDefinition[];
}

export interface EngineStatus {
  ready: boolean;
  usingBlenderAsset: boolean;
  variant: 'desktop' | 'low';
  message: string;
}
