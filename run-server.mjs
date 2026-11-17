const mode = process.argv[2];

if (mode !== 'development' && mode !== 'production') {
  throw new Error('Specify development or production mode.');
}

process.env.NODE_ENV = mode;
await import('./server.ts');
