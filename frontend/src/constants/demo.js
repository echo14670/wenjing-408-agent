/** 演示默认值：不依赖后端也能直接打开三页看效果 */
export const DEMO_QUERY =
  '32 位物理地址、Cache 数据区 32 KiB、块大小 64 B、四路组相联，求标记、组索引与块内偏移各占多少位？'
export const DEMO_THOUGHT = '我觉得「四路」就是四组，所以组索引应该占 2 位。'
export const DEMO_SUGGESTIONS = ['为什么不是 2 位？', '总行数是怎么算出来的？', '如果改成八路会怎样？']

/** 同考点练习态的追问建议：不复用原题建议，避免把旧题的疑问带到新题 */
export const PRACTICE_SUGGESTIONS = ['组索引为什么是 7 位？', '总行数 512 是怎么来的？', '如果改成八路会怎样？']
