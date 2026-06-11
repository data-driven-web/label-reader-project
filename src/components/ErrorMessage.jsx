/**
 * ErrorMessage — standardized error display.
 * Every message names exactly what happened and what to do next.
 */
export default function ErrorMessage({ title = 'Something needs your attention', message, onRetry, onDismiss }) {
  if (!message) return null;
  return (
    <div role="alert" className="border-l-4 border-red-600 bg-red-50 p-4 my-3">
      <p className="font-semibold text-red-800 text-base">{title}</p>
      <p className="text-red-800 text-base mt-1">{message}</p>
      <div className="mt-3 flex gap-3">
        {onRetry && (
          <button onClick={onRetry}
            className="min-h-[44px] px-5 bg-red-600 text-white text-base font-medium rounded hover:bg-red-700">
            Retry
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss}
            className="min-h-[44px] px-5 border border-gray-400 text-gray-700 text-base rounded hover:bg-gray-100">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
