import {assertPersistedDocument, DOCUMENT_FORMAT_ID, DOCUMENT_FORMAT_VERSION, migratePersistedDocument, PersistedDocument} from './document-file.types';

describe('BlockCraft document format validation', () => {
  const document = {
    manifest: {
      formatId: DOCUMENT_FORMAT_ID,
      formatVersion: DOCUMENT_FORMAT_VERSION,
      documentId: 'doc-1',
      title: 'Test',
      createdAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z',
      assets: [],
    },
    snapshot: {id: 'root', flavour: 'root', nodeType: 'root', meta: {}, props: {}, children: []},
    assets: [],
  } as PersistedDocument;

  it('accepts a v1 root snapshot document', () => {
    expect(() => assertPersistedDocument(document)).not.toThrow();
    expect(migratePersistedDocument(document)).toBe(document);
  });

  it('rejects a future version instead of silently loading it', () => {
    expect(() => assertPersistedDocument({
      ...document,
      manifest: {...document.manifest, formatVersion: 2},
    })).toThrowError(/暂不支持的文档格式版本/);
  });

  it('rejects duplicate asset ids and traversal paths', () => {
    const asset = {id: 'abc', path: '../outside.bin', mime: 'application/octet-stream', name: 'x', size: 1, sha256: 'abc', bytes: [1]};
    expect(() => assertPersistedDocument({...document, assets: [asset], manifest: {...document.manifest, assets: [asset]}})).toThrowError(/资源路径非法/);
  });
});
