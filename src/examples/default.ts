export const DEFAULT_SVG = `<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 400 240"
  width="400"
  height="240"
  style="--dot-size: 9px; --period: 4s; --ink: #c1432e; --paper: #e8e3d5"
>
  <!-- @control dot-size min=5 max=18 step=1 -->
  <!-- @control period min=1 max=10 step=0.25 -->
  <style>
    .orbit {
      transform-origin: 200px 120px;
      animation: orbit var(--period) linear infinite;
    }
    .dot { r: var(--dot-size); fill: var(--ink); }
    .guide { fill: none; stroke: var(--paper); stroke-opacity: .18; }
    .label { fill: var(--paper); font: 14px ui-monospace, monospace; }
    @keyframes orbit { to { transform: rotate(360deg); } }
  </style>
  <rect width="400" height="240" fill="#0e0e0d" />
  <circle class="guide" cx="200" cy="120" r="68" />
  <g class="orbit" id="orbit">
    <circle class="dot" id="dot" cx="200" cy="52" r="9">
      <animate
        attributeName="opacity"
        values=".45;1;.45"
        dur="2s"
        repeatCount="indefinite"
      />
    </circle>
  </g>
  <text class="label" x="24" y="212">CSS orbit · SMIL pulse</text>
</svg>`;
