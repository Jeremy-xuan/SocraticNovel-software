import ReactDOM from "react-dom/client";
import './i18n';
import App from "./App";
import { useAppStore } from './stores/appStore';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// Expose store for E2E testing (dev only)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__APP_STORE__'] = useAppStore;
}
