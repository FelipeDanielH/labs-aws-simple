export type MarkdownFile = {
  name: string;
  size: number;
  type: string;
  text: () => Promise<string>;
};
