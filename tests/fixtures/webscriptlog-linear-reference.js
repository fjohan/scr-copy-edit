/* Reference functions copied verbatim for compatibility testing.
Source: /data/html/wscr/webscriptlog/panes/linear/webscriptlog_linear.js
SHA-256 of source: 64035239c1eeb425987f066196e907da0951848908dd50a1884912779dc9dd9f
*/
function parseLinearRepresentation(linear) {
  const actions = [];
  const text = String(linear || '');
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '<') {
      actions.push({ type: 'char', value: text[i] });
      i += 1;
      continue;
    }

    const end = text.indexOf('>', i);
    if (end === -1) {
      actions.push({ type: 'char', value: text[i] });
      i += 1;
      continue;
    }

    const token = text.slice(i + 1, end);
    if (token === 'ENTER') actions.push({ type: 'char', value: '\n' });
    else if (token === 'LT') actions.push({ type: 'char', value: '<' });
    else if (token === 'GT') actions.push({ type: 'char', value: '>' });
    else if (/^\d+(?:\.\d{1,3})?$/.test(token)) actions.push({ type: 'command', command: 'PAUSE', seconds: Number(token) });
    else if (/^DEL\d*$/.test(token)) actions.push({ type: 'command', command: 'DEL', count: token.length > 3 ? Number(token.slice(3)) : 1 });
    else if (/^FDEL\d*$/.test(token)) actions.push({ type: 'command', command: 'FDEL', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (token === 'LEFT_TO_START') actions.push({ type: 'command', command: 'LEFT_TO_START' });
    else if (token === 'RIGHT_TO_END') actions.push({ type: 'command', command: 'RIGHT_TO_END' });
    else if (token === 'UP_TO_START') actions.push({ type: 'command', command: 'UP_TO_START' });
    else if (token === 'DOWN_TO_END') actions.push({ type: 'command', command: 'DOWN_TO_END' });
    else if (/^LEFT\d*$/.test(token)) actions.push({ type: 'command', command: 'LEFT', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (/^RIGHT\d*$/.test(token)) actions.push({ type: 'command', command: 'RIGHT', count: token.length > 5 ? Number(token.slice(5)) : 1 });
    else if (/^UP\d*$/.test(token)) actions.push({ type: 'command', command: 'UP', count: token.length > 2 ? Number(token.slice(2)) : 1 });
    else if (/^DOWN\d*$/.test(token)) actions.push({ type: 'command', command: 'DOWN', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (/^SLEFT\d*$/.test(token)) actions.push({ type: 'command', command: 'SLEFT', count: token.length > 5 ? Number(token.slice(5)) : 1 });
    else if (/^SRIGHT\d*$/.test(token)) actions.push({ type: 'command', command: 'SRIGHT', count: token.length > 6 ? Number(token.slice(6)) : 1 });
    else if (/^SUP\d*$/.test(token)) actions.push({ type: 'command', command: 'SUP', count: token.length > 3 ? Number(token.slice(3)) : 1 });
    else if (/^SDOWN\d*$/.test(token)) actions.push({ type: 'command', command: 'SDOWN', count: token.length > 5 ? Number(token.slice(5)) : 1 });
    else if (token === 'HOME') actions.push({ type: 'command', command: 'HOME' });
    else if (token === 'END') actions.push({ type: 'command', command: 'END' });
    else if (/^NAV\d+$/.test(token)) actions.push({ type: 'command', command: 'NAV', pos: Number(token.slice(3)) });
    else if (token === 'COPY') actions.push({ type: 'command', command: 'COPY' });
    else if (token === 'CUT') actions.push({ type: 'command', command: 'CUT' });
    else if (token === 'PASTE') actions.push({ type: 'command', command: 'PASTE' });
    else if (/^UNDO\*$/.test(token)) actions.push({ type: 'command', command: 'UNDO', count: 999, saturated: true });
    else if (/^REDO\*$/.test(token)) actions.push({ type: 'command', command: 'REDO', count: 999, saturated: true });
    else if (/^UNDO\d*$/.test(token)) actions.push({ type: 'command', command: 'UNDO', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (/^REDO\d*$/.test(token)) actions.push({ type: 'command', command: 'REDO', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (token === 'SELECTALL') actions.push({ type: 'command', command: 'SELECTALL' });
    else if (/^BDEL\d+:\d+$/.test(token)) {
      const pair = token.slice(4).split(':').map(Number);
      actions.push({ type: 'command', command: 'BDEL', left: pair[0], right: pair[1] });
    }
    else if (/^CLICK\d+$/.test(token)) actions.push({ type: 'command', command: 'CLICK', pos: Number(token.slice(5)) });
    else if (/^SEL\d+:\d+$/.test(token)) {
      const pair = token.slice(3).split(':').map(Number);
      actions.push({ type: 'command', command: 'SEL', start: pair[0], end: pair[1] });
    }
    else if (/^KEY:/.test(token)) actions.push({ type: 'command', command: token });
    else actions.push({ type: 'literal-token', value: `<${token}>` });

    i = end + 1;
  }

  return actions;
}

function reconstructTextFromLinearRepresentation(linear) {
  const actions = parseLinearRepresentation(linear);
  let text = '';
  let selectionStart = 0;
  let selectionEnd = 0;
  let selectionAnchor = 0;
  let selectionFocus = 0;

  function insertTextAtSelection(value) {
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    text = text.slice(0, start) + value + text.slice(end);
    selectionStart = start + value.length;
    selectionEnd = selectionStart;
    selectionAnchor = selectionStart;
    selectionFocus = selectionStart;
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.type === 'char') {
      insertTextAtSelection(action.value);
      continue;
    }

    if (action.type === 'literal-token') {
      insertTextAtSelection(action.value);
      continue;
    }

    if (action.command === 'SEL') {
      const nextState = makeSelectionStateFromRange(action.start, action.end);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'PAUSE') {
      continue;
    }

    if (action.command === 'COPY' || action.command === 'CUT' || action.command === 'PASTE' || action.command === 'UNDO' || action.command === 'REDO' || action.command === 'SELECTALL') {
      continue;
    }

    if (action.command === 'CLICK') {
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'NAV') {
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'BDEL') {
      const left = Math.max(0, Number(action.left) || 0);
      const right = Math.max(0, Number(action.right) || 0);
      const cursor = Math.max(0, Math.min(selectionEnd, text.length));
      const rightEnd = Math.min(text.length, cursor + right);
      text = text.slice(0, cursor) + text.slice(rightEnd);
      const leftStart = Math.max(0, cursor - left);
      text = text.slice(0, leftStart) + text.slice(cursor);
      selectionStart = leftStart;
      selectionEnd = leftStart;
      selectionAnchor = leftStart;
      selectionFocus = leftStart;
      continue;
    }

    if (action.command === 'DEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        if (selectionStart !== selectionEnd) {
          insertTextAtSelection('');
        } else if (selectionStart > 0) {
          text = text.slice(0, selectionStart - 1) + text.slice(selectionStart);
          selectionStart -= 1;
          selectionEnd = selectionStart;
          selectionAnchor = selectionStart;
          selectionFocus = selectionStart;
        }
      }
      continue;
    }

    if (action.command === 'FDEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        if (selectionStart !== selectionEnd) {
          insertTextAtSelection('');
        } else if (selectionStart < text.length) {
          text = text.slice(0, selectionStart) + text.slice(selectionStart + 1);
          selectionEnd = selectionStart;
          selectionAnchor = selectionStart;
          selectionFocus = selectionStart;
        }
      }
      continue;
    }

    if (action.command === 'LEFT') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const cursor = Math.min(selectionStart, selectionEnd);
        if (selectionStart !== selectionEnd) selectionStart = cursor;
        else selectionStart = Math.max(0, cursor - 1);
        selectionEnd = selectionStart;
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
      }
      continue;
    }

    if (action.command === 'LEFT_TO_START') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      continue;
    }

    if (action.command === 'RIGHT') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const cursor = Math.max(selectionStart, selectionEnd);
        if (selectionStart !== selectionEnd) selectionStart = cursor;
        else selectionStart = Math.min(text.length, cursor + 1);
        selectionEnd = selectionStart;
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
      }
      continue;
    }

    if (action.command === 'RIGHT_TO_END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
      continue;
    }

    if (action.command === 'UP_TO_START') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      continue;
    }

    if (action.command === 'DOWN_TO_END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
      continue;
    }

    if (action.command === 'SLEFT' || action.command === 'SRIGHT' || action.command === 'SUP' || action.command === 'SDOWN') {
      const keyName = action.command === 'SLEFT'
        ? 'ArrowLeft'
        : action.command === 'SRIGHT'
          ? 'ArrowRight'
          : action.command === 'SUP'
            ? 'ArrowUp'
            : 'ArrowDown';
      const nextState = applyShiftNavigationKeyToSelection(keyName, text, selectionAnchor, selectionFocus, action.count);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'UP' || action.command === 'DOWN') {
      continue;
    }

    if (action.command === 'HOME') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      continue;
    }

    if (action.command === 'END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
    }
  }

  return { final_text: text, cursor: selectionEnd };
}

function makeCollapsedSelectionState(pos) {
  const value = Math.max(0, Number(pos) || 0);
  return {
    start: value,
    end: value,
    anchor: value,
    focus: value
  };
}

function makeSelectionStateFromAnchorFocus(anchor, focus) {
  const a = Math.max(0, Number(anchor) || 0);
  const f = Math.max(0, Number(focus) || 0);
  return {
    start: Math.min(a, f),
    end: Math.max(a, f),
    anchor: a,
    focus: f
  };
}

function makeSelectionStateFromRange(start, end, preferFocus) {
  const s = Math.max(0, Number(start) || 0);
  const e = Math.max(0, Number(end) || 0);
  if (s === e) return makeCollapsedSelectionState(s);
  if (preferFocus === 'start') return makeSelectionStateFromAnchorFocus(e, s);
  return makeSelectionStateFromAnchorFocus(s, e);
}

function applyShiftNavigationKeyToSelection(keyName, currentText, anchor, focus, count = 1) {
  const textLength = String(currentText || '').length;
  const n = Math.max(1, Number(count) || 1);
  const baseAnchor = Math.max(0, Number(anchor) || 0);
  const baseFocus = Math.max(0, Number(focus) || 0);

  if (keyName === 'ArrowLeft') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, Math.max(0, baseFocus - n));
  }
  if (keyName === 'ArrowRight') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, Math.min(textLength, baseFocus + n));
  }
  if (keyName === 'Home') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, 0);
  }
  if (keyName === 'End') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, textLength);
  }

  return makeSelectionStateFromAnchorFocus(baseAnchor, baseFocus);
}
