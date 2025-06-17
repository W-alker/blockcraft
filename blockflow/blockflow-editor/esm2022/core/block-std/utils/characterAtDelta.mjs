export const characterAtDelta = (deltas, position) => {
    let currentPosition = 1;
    for (let i = 0; i < deltas.length; i++) {
        const delta = deltas[i];
        if (typeof delta.insert === 'string') {
            // 如果 insert 是文本
            const insertText = delta.insert;
            const textLength = insertText.length;
            if (currentPosition + textLength >= position) {
                // 如果目标位置在当前 insert 字符串中
                const charIndex = position - currentPosition;
                return insertText.charAt(charIndex);
            }
            currentPosition += textLength;
        }
        else {
            // 如果是嵌入对象，算作一个字符
            if (currentPosition === position) {
                // 如果目标位置是嵌入对象的位置，返回该对象
                return delta.insert;
            }
            currentPosition += 1;
        }
    }
    // 如果遍历完所有 delta 后仍然没有找到，说明位置超出了长度
    return null;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhcmFjdGVyQXREZWx0YS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL2Jsb2NrZmxvdy9zcmMvY29yZS9ibG9jay1zdGQvdXRpbHMvY2hhcmFjdGVyQXREZWx0YS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLE1BQXFCLEVBQUUsUUFBZ0IsRUFBMEIsRUFBRTtJQUNsRyxJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7SUFFeEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN2QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFeEIsSUFBSSxPQUFPLEtBQUssQ0FBQyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDckMsZ0JBQWdCO1lBQ2hCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDaEMsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQztZQUVyQyxJQUFJLGVBQWUsR0FBRyxVQUFVLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQzdDLHdCQUF3QjtnQkFDeEIsTUFBTSxTQUFTLEdBQUcsUUFBUSxHQUFHLGVBQWUsQ0FBQztnQkFDN0MsT0FBTyxVQUFVLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3RDLENBQUM7WUFDRCxlQUFlLElBQUksVUFBVSxDQUFDO1FBQ2hDLENBQUM7YUFBTSxDQUFDO1lBQ04saUJBQWlCO1lBQ2pCLElBQUksZUFBZSxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUNqQyx1QkFBdUI7Z0JBQ3ZCLE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQztZQUN0QixDQUFDO1lBQ0QsZUFBZSxJQUFJLENBQUMsQ0FBQztRQUN2QixDQUFDO0lBQ0gsQ0FBQztJQUVELGtDQUFrQztJQUNsQyxPQUFPLElBQUksQ0FBQztBQUNkLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7RGVsdGFJbnNlcnR9IGZyb20gXCIuLi8uLi90eXBlc1wiO1xuXG5leHBvcnQgY29uc3QgY2hhcmFjdGVyQXREZWx0YSA9IChkZWx0YXM6IERlbHRhSW5zZXJ0W10sIHBvc2l0aW9uOiBudW1iZXIpOiBzdHJpbmcgfCBvYmplY3QgfCBudWxsID0+IHtcbiAgbGV0IGN1cnJlbnRQb3NpdGlvbiA9IDE7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBkZWx0YSA9IGRlbHRhc1tpXTtcblxuICAgIGlmICh0eXBlb2YgZGVsdGEuaW5zZXJ0ID09PSAnc3RyaW5nJykge1xuICAgICAgLy8g5aaC5p6cIGluc2VydCDmmK/mlofmnKxcbiAgICAgIGNvbnN0IGluc2VydFRleHQgPSBkZWx0YS5pbnNlcnQ7XG4gICAgICBjb25zdCB0ZXh0TGVuZ3RoID0gaW5zZXJ0VGV4dC5sZW5ndGg7XG5cbiAgICAgIGlmIChjdXJyZW50UG9zaXRpb24gKyB0ZXh0TGVuZ3RoID49IHBvc2l0aW9uKSB7XG4gICAgICAgIC8vIOWmguaenOebruagh+S9jee9ruWcqOW9k+WJjSBpbnNlcnQg5a2X56ym5Liy5LitXG4gICAgICAgIGNvbnN0IGNoYXJJbmRleCA9IHBvc2l0aW9uIC0gY3VycmVudFBvc2l0aW9uO1xuICAgICAgICByZXR1cm4gaW5zZXJ0VGV4dC5jaGFyQXQoY2hhckluZGV4KTtcbiAgICAgIH1cbiAgICAgIGN1cnJlbnRQb3NpdGlvbiArPSB0ZXh0TGVuZ3RoO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyDlpoLmnpzmmK/ltYzlhaXlr7nosaHvvIznrpfkvZzkuIDkuKrlrZfnrKZcbiAgICAgIGlmIChjdXJyZW50UG9zaXRpb24gPT09IHBvc2l0aW9uKSB7XG4gICAgICAgIC8vIOWmguaenOebruagh+S9jee9ruaYr+W1jOWFpeWvueixoeeahOS9jee9ru+8jOi/lOWbnuivpeWvueixoVxuICAgICAgICByZXR1cm4gZGVsdGEuaW5zZXJ0O1xuICAgICAgfVxuICAgICAgY3VycmVudFBvc2l0aW9uICs9IDE7XG4gICAgfVxuICB9XG5cbiAgLy8g5aaC5p6c6YGN5Y6G5a6M5omA5pyJIGRlbHRhIOWQjuS7jeeEtuayoeacieaJvuWIsO+8jOivtOaYjuS9jee9rui2heWHuuS6humVv+W6plxuICByZXR1cm4gbnVsbDtcbn1cbiJdfQ==