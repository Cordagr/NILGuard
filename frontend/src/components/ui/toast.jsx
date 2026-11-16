import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { CheckCircle2Icon, XIcon } from 'lucide-react';
import './toast.css';

const ToastContext = createContext(null);
let toastSequence = 0;

function ToastCard({ toast, onDismiss }) {
  const timeoutRef = useRef(null);
  const remainingTimeRef = useRef(toast.duration);
  const startedAtRef = useRef(0);

  const pauseTimer = () => {
    if (timeoutRef.current === null) {
      return;
    }

    window.clearTimeout(timeoutRef.current);
    remainingTimeRef.current = Math.max(
      0,
      remainingTimeRef.current - (Date.now() - startedAtRef.current)
    );
    timeoutRef.current = null;
  };

  const resumeTimer = () => {
    if (toast.isExiting || timeoutRef.current !== null) {
      return;
    }

    startedAtRef.current = Date.now();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      remainingTimeRef.current = 0;
      onDismiss(toast.id);
    }, remainingTimeRef.current);
  };

  useEffect(() => {
    if (!toast.isExiting) {
      resumeTimer();
    }

    return pauseTimer;
  }, [toast.isExiting]);

  const handleAction = () => {
    toast.onAction?.();
    onDismiss(toast.id);
  };

  return (
    <div
      className={`app-toast app-toast-${toast.variant}${toast.isExiting ? ' is-exiting' : ''}`}
      style={{ '--toast-duration': `${toast.duration}ms` }}
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      {toast.variant === 'success' ? (
        <CheckCircle2Icon className="app-toast-icon" aria-hidden="true" />
      ) : null}
      <div className="app-toast-content">
        <div className="app-toast-title">{toast.title}</div>
        {toast.detail ? <div className="app-toast-detail">{toast.detail}</div> : null}
        {toast.actionLabel ? (
          <button type="button" className="app-toast-action" onClick={handleAction}>
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="app-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <XIcon aria-hidden="true" />
      </button>
      <div className="app-toast-progress" aria-hidden="true" />
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const removalTimersRef = useRef(new Map());

  const showToast = useCallback(({ variant = 'info', title, detail = '', actionLabel, onAction }) => {
    const resolvedVariant = ['success', 'error', 'info'].includes(variant) ? variant : 'info';
    const toast = {
      id: `toast-${++toastSequence}`,
      variant: resolvedVariant,
      title: String(title || ''),
      detail: detail ? String(detail) : '',
      actionLabel: actionLabel ? String(actionLabel) : '',
      onAction,
      duration: resolvedVariant === 'error' ? 8000 : 5000,
      isExiting: false
    };

    setToasts((previous) => [toast, ...previous]);
    return toast.id;
  }, []);

  const dismissToast = useCallback((toastId) => {
    if (removalTimersRef.current.has(toastId)) {
      return;
    }

    setToasts((previous) => previous.map((toast) => (
      toast.id === toastId ? { ...toast, isExiting: true } : toast
    )));
    const timerId = window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== toastId));
      removalTimersRef.current.delete(toastId);
    }, 180);
    removalTimersRef.current.set(toastId, timerId);
  }, []);

  useEffect(() => () => {
    removalTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    removalTimersRef.current.clear();
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="app-toast-viewport" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.');
  }

  return context;
}

export function ToastMessage({
  message,
  variant = 'info',
  title,
  detail,
  actionLabel,
  onAction
}) {
  const { showToast } = useToast();
  const actionRef = useRef(onAction);

  useEffect(() => {
    actionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!message) {
      return;
    }

    showToast({
      variant,
      title: title || (variant === 'error' ? 'Error' : variant === 'success' ? 'Success' : 'Notice'),
      detail: detail === undefined ? String(message) : detail,
      actionLabel,
      onAction: actionLabel ? () => actionRef.current?.() : undefined
    });
  }, [message, variant, title, detail, actionLabel, showToast]);

  return null;
}
