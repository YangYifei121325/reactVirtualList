import { useMemo } from 'react'
import VirtualList from './components/VirtualList'
import './App.css'

interface ListItem {
  id: number
  title: string
  content: string
}

function generateData(count: number): ListItem[] {
  const titles = [
    '短标题',
    '一个稍长一点的标题文本内容',
    '中标题',
    '非常非常非常非常非常非常长的标题用来测试高度自适应效果',
  ]
  const contents = [
    '简短内容。',
    '这里是一段中等长度的内容，用于测试列表项的高度自适应能力。内容越多高度越高。',
    '这是一段非常长的内容。' +
      '它包含很多文字，用来模拟真实场景中每条数据高度不一致的情况。' +
      '虚拟列表需要能够正确测量每一条的真实高度并动态调整偏移量，' +
      '否则就会出现滚动抖动、白屏、滚动条跳动等问题。' +
      '下面继续填充一些文字来让高度差异更加明显，方便观察虚拟列表的工作效果。' +
      '不定高度虚拟列表的核心在于「先估算、后测量、再修正」三步走。',
    '只有一行。',
    '两行内容演示。\n换行之后会变高。',
  ]
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    title: titles[i % titles.length],
    content: contents[i % contents.length],
  }))
}

function App() {
  const data = useMemo(() => generateData(10000), [])

  return (
    <>
      <section id="center">
        <div>
          <h1>不定高度虚拟列表</h1>
          <p style={{ marginBottom: 16 }}>
            共 <code>{data.length}</code> 条数据，每条高度自适应，仅渲染可视区域 DOM
          </p>
        </div>

        <div className="virtual-list-demo">
          <VirtualList
            data={data}
            estimatedItemHeight={80}
            height={500}
            overscan={5}
            renderItem={(item, index) => (
              <div
                className={`v-item ${index % 2 === 0 ? 'v-item-even' : 'v-item-odd'}`}
              >
                <div className="v-item-index">#{index + 1}</div>
                <div className="v-item-body">
                  <div className="v-item-title">{item.title}</div>
                  <div className="v-item-content">{item.content}</div>
                </div>
              </div>
            )}
          />
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
