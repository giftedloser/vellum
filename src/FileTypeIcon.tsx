type FileTypeIconProps = {
  kind: "markdown" | "html";
  size?: number;
};

export default function FileTypeIcon({ kind, size = 15 }: FileTypeIconProps) {
  return kind === "html" ? (
    <svg className="file-type-icon icon-html" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="HTML" data-file-kind="html">
      <path fill="#e44d26" d="M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z" />
    </svg>
  ) : (
    <svg className="file-type-icon icon-markdown" width={size} height={size} viewBox="0 0 208 128" role="img" aria-label="Markdown" data-file-kind="markdown">
      <path fill="#3b82f6" fillRule="evenodd" d="M15 10c-2.761 0-5 2.239-5 5v98c0 2.761 2.239 5 5 5h178c2.761 0 5-2.239 5-5V15c0-2.761-2.239-5-5-5zM0 15C0 6.716 6.716 0 15 0h178c8.284 0 15 6.716 15 15v98c0 8.284-6.716 15-15 15H15c-8.284 0-15-6.716-15-15z" />
      <path fill="#3b82f6" d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z" />
    </svg>
  );
}
