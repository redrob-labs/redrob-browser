import {
  parse
} from "./chunk-WPGAF52N.js";
import "./chunk-JJDGQAIE.js";
import "./chunk-SXVPP3WM.js";
import {
  selectSvgElement
} from "./chunk-CMKAH7VL.js";
import "./chunk-JFEJ4QP6.js";
import "./chunk-SL7VCVEZ.js";
import "./chunk-FINT47QG.js";
import "./chunk-OA3I6ZLL.js";
import "./chunk-TRUGPRTD.js";
import "./chunk-W5LZ7TAF.js";
import "./chunk-K32IQ6WX.js";
import "./chunk-V5FFNPEI.js";
import "./chunk-ZSXPQT2W.js";
import "./chunk-N6L6HZDX.js";
import "./chunk-OONTNBZY.js";
import "./chunk-VIG6MK6T.js";
import "./chunk-5EC4PSDY.js";
import "./chunk-TAGV4B4G.js";
import {
  configureSvgSize
} from "./chunk-QZ7JPWIU.js";
import {
  log
} from "./chunk-IAKO6OUJ.js";
import {
  __name
} from "./chunk-XEVBOL3F.js";
import "./chunk-I6XLRVDC.js";

// node_modules/mermaid/dist/chunks/mermaid.core/infoDiagram-RXCK75RN.mjs
var parser = {
  parse: /* @__PURE__ */ __name(async (input) => {
    const ast = await parse("info", input);
    log.debug(ast);
  }, "parse")
};
var DEFAULT_INFO_DB = {
  version: "11.17.0" + (true ? "" : "-tiny")
};
var getVersion = /* @__PURE__ */ __name(() => DEFAULT_INFO_DB.version, "getVersion");
var db = {
  getVersion
};
var draw = /* @__PURE__ */ __name((text, id, version) => {
  log.debug("rendering info diagram\n" + text);
  const svg = selectSvgElement(id);
  configureSvgSize(svg, 100, 400, true);
  const group = svg.append("g");
  group.append("text").attr("x", 100).attr("y", 40).attr("class", "version").attr("font-size", 32).style("text-anchor", "middle").text(`v${version}`);
}, "draw");
var renderer = { draw };
var diagram = {
  parser,
  db,
  renderer
};
export {
  diagram
};
//# sourceMappingURL=infoDiagram-RXCK75RN-QBPKXLK2.js.map
