import avatarRaw from '../knowledge/avatar.md?raw';
import brandRaw from '../knowledge/brand.md?raw';
import productRaw from '../knowledge/product.md?raw';
import modelsRaw from '../knowledge/models.md?raw';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const FILES = [
  { key: 'avatar', label: 'Customer Avatar', content: avatarRaw },
  { key: 'brand', label: 'Brand Guidelines', content: brandRaw },
  { key: 'product', label: 'Product Knowledge', content: productRaw },
  { key: 'models', label: 'AI Model Credentials', content: modelsRaw },
];

export default function KnowledgeFiles() {
  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 8 }}>
        Knowledge Files
      </h2>
      <p style={{ fontSize: 13, color: FR.stone, marginBottom: 24 }}>
        These files are injected into every brief generation prompt. Edit them in the repo at{' '}
        <code style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11 }}>src/components/creative/knowledge/</code>.
      </p>
      <div style={{ display: 'grid', gap: 16 }}>
        {FILES.map(f => (
          <div key={f.key} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '16px 20px' }}>
            <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 16, fontWeight: 400, color: FR.slate, marginBottom: 12 }}>{f.label}</p>
            <pre style={{
              fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
              fontSize: 11,
              color: FR.stone,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 240,
              overflowY: 'auto',
              margin: 0,
            }}>
              {f.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
