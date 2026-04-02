// iframe → React 的统一消息类型（discriminated union）
export interface IframeToParentMessage {
  type: 'SANDBOX_READY' | 'STATE_UPDATE';
  // SANDBOX_READY 和 STATE_UPDATE 无 payload
}

export interface IframeInteractionMessage {
  type: 'INTERACTION';
  payload: { action: string; state: Record<string, unknown> };
}

export interface IframeErrorMessage {
  type: 'ERROR';
  payload: { message: string };
}

// 导出联合类型供组件 cast 使用
export type SandboxMessage =
  | IframeToParentMessage
  | IframeInteractionMessage
  | IframeErrorMessage;

// React → iframe 的消息类型（AI 不需要，保留扩展）
export interface ParentToIframeMessage {
  type: 'SET_PARAMS' | 'RESET' | 'UPDATE_STATE';
  params?: Record<string, unknown>;
}

// appStore 中 sandbox 状态接口
export interface SandboxState {
  activeSandboxCount: number;
  sandboxErrors: Record<string, string>;
}
