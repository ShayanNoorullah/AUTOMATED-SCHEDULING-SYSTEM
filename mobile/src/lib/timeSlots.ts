/** 15-minute slots in 12-hour format (matches web buildTimeOptions). */
export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let i = 0; i < 24; i++) {
    for (const m of [0, 15, 30, 45]) {
      const ap = i < 12 ? "am" : "pm";
      const hr = i % 12 || 12;
      slots.push(`${hr}:${String(m).padStart(2, "0")}${ap}`);
    }
  }
  return slots;
})();
