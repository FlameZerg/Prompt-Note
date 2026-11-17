import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

// 指针长按排序避免 HTML 拖放在 WebView 中对文本选择和触摸支持不一致。
export function useCardDrag(id: string, onMove: (source: string, target: string) => void, disabled: boolean = false) {
  const [dragging, setDragging] = useState(false);
  const active = useRef(false);
  const suppressClick = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tracking = useRef<{ element: HTMLElement; pointerId: number } | null>(null);
  const reset = useCallback((updateState = true) => {
    clearTimeout(timer.current);
    const previous = tracking.current;
    tracking.current = null;
    active.current = false;
    if (updateState) setDragging(false);
    if (previous?.element.hasPointerCapture(previous.pointerId)) previous.element.releasePointerCapture(previous.pointerId);
    document.querySelectorAll('.drop-target').forEach(element => element.classList.remove('drop-target'));
  }, []);
  useEffect(() => {
    // 切换窗口或卸载不能留下捕获中的指针、计时器或落点样式。
    const cancel = () => { suppressClick.current = true; reset(); };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); reset(false); };
  }, [reset]);
  function activate(element: HTMLElement, pointerId: number) {
    if (!element.isConnected || tracking.current?.pointerId !== pointerId || active.current) return;
    clearTimeout(timer.current);
    active.current = true;
    suppressClick.current = true;
    setDragging(true);
  }
  const finish = (event: PointerEvent<HTMLElement>, cancelled = false) => {
    if (tracking.current?.pointerId !== event.pointerId) return;
    const moving = active.current;
    // 自动滚动或最后一次移动后布局可能变化，必须按释放坐标重新命中。
    const target = moving && !cancelled && !disabled
      ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-prompt-id]')?.dataset.promptId ?? id
      : id;
    if (cancelled) suppressClick.current = true;
    reset();
    if (moving && !cancelled && !disabled && target !== id) onMove(id, target);
  };
  return {
    // 手势状态由 hook 自己维护，组件只读取结果或调用明确的操作。
    dragging, canCopy: () => !suppressClick.current,
    enableKeyboardCopy: () => { suppressClick.current = false; },
    handlers: {
      onPointerDownCapture(event: PointerEvent<HTMLElement>) {
        if (disabled || event.defaultPrevented || !event.isPrimary || tracking.current || event.button !== 0
          || !(event.target instanceof Element)
          || event.target.closest('button:not(.copy-surface), a, input, textarea, select, [contenteditable="true"]')) return;
        suppressClick.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
        const element = event.currentTarget;
        const pointerId = event.pointerId;
        tracking.current = { element, pointerId };
        // 在捕获阶段由整卡接管指针，覆盖复制层、文字、标签和空白区域。
        try { element.setPointerCapture(pointerId); }
        catch (error) {
          console.error('捕获卡片拖动指针失败：', error);
          suppressClick.current = true;
          reset();
          return;
        }
        timer.current = setTimeout(() => activate(element, pointerId), 320);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        if (tracking.current?.pointerId !== event.pointerId) return;
        if (disabled) { suppressClick.current = true; reset(); return; }
        if (!active.current) {
          if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) <= 8) return;
          // 桌面参照整卡拖动的位移激活；触摸短滑仍交给滚动，不误排序。
          if (event.pointerType !== 'mouse') {
            suppressClick.current = true;
            reset();
            return;
          }
          activate(event.currentTarget, event.pointerId);
        }
        event.preventDefault();
        const card = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-prompt-id]');
        document.querySelectorAll('.drop-target').forEach(element => element.classList.remove('drop-target'));
        if (card && card.dataset.promptId !== id) card.classList.add('drop-target');
        const content = event.currentTarget.closest('.content-scroll');
        // 短窗口使用主区单滚动容器，拖动边缘滚动必须跟随实际容器。
        const scroller = content && getComputedStyle(content).overflowY === 'visible'
          ? content.closest('.workspace') : content;
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          if (event.clientY < rect.top + 50) scroller.scrollBy(0, -18);
          if (event.clientY > rect.bottom - 50) scroller.scrollBy(0, 18);
        }
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, true),
      onLostPointerCapture(event: PointerEvent<HTMLElement>) {
        // 子元素将隐式捕获交给整卡时也会冒泡此事件，不能误取消新捕获。
        if (event.target === event.currentTarget) finish(event, true);
      },
    },
  };
}
