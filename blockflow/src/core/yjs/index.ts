import * as Y from 'yjs'

// cover Y.Text.prototype.toJSON globally
Y.Text.prototype.toJSON = Y.Text.prototype.toDelta

export default Y
export * from './blockModel2y'
export * from './docWrapper'
export * from './changeProxy'


