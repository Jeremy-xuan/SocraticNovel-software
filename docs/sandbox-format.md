# AI 生成 InteractiveSandbox 代码格式约定

## 必须包含的通信代码

```html
<script>
window.parent.postMessage({ type: 'SANDBOX_READY' }, window.__PARENT_ORIGIN__);

function notifyInteraction(action, state) {
  window.parent.postMessage({
    type: 'INTERACTION',
    payload: { action, state }
  }, window.__PARENT_ORIGIN__);
}
```

## 状态函数约定

AI 生成的 HTML 应暴露一个全局函数，用于获取当前交互状态：

```javascript
// 示例：实际状态由 AI 的 HTML 内部定义
window.getSandboxState = function() {
  // 返回实际存在的状态变量
  return { /* actual state here */ };
};
```

当用户触发交互事件时，`notifyInteraction` 调用中应传入实际状态对象：

```javascript
notifyInteraction('button_click', window.getSandboxState ? window.getSandboxState() : {});
```

## 样式约定

- 使用 CSS 变量：`var(--canvas-bg)`
- 禁止外部 CSS/JS 链接
- 必须自包含 HTML+CSS+JS
