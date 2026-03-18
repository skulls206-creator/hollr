interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
  [key: string]: string | undefined;
}
