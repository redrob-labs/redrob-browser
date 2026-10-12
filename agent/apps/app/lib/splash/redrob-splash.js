/* Redrob launch splash - Redrob Design System 2026.
 *
 * Two beats, once per session:
 *   1. The Redrob lockup, uncovered along a 40 degree edge with light riding on it
 *      (MarkReveal, 10-logo.md "Animation"). Primary on light, Primary White on dark.
 *   2. The product icon settles in from 90 percent, one pass of light crosses it, and
 *      its symbol keeps its one quiet working state (40-surfaces-and-motion.md,
 *      "Product symbols") with the product name in Pretendard SemiBold beneath it.
 *
 * Reduced motion: nothing moves; the lockup, then the still icon. Any key or click skips.
 * Generated from the DS files by brand-2026/kit-src; the artwork is never redrawn.
 */

const PRODUCT = "browser"
const NAME = "Redrob Browser"
const ICONS = {"light":"<svg class=\"rs-icon rs-icon--browser\" role=\"presentation\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"rs-browser-l-lb\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0.839\"><stop offset=\"0.38\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"0.5\" stop-color=\"#fff\" stop-opacity=\"0.22\"/><stop offset=\"0.62\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient><clipPath id=\"rs-browser-l-door\"><path d=\"M245.8 176.7 L778.2 -17.0 L778.2 1040.6 L245.8 846.6 Z\"/></clipPath><mask id=\"rs-browser-l-m45\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"1024\" height=\"1024\"><g transform=\"translate(512 512) scale(33.96569) translate(-13.5909 -11.8452)\"><defs><mask id=\"rs-browser-l-m45-p2a\" maskUnits=\"userSpaceOnUse\" x=\"-10\" y=\"-10\" width=\"44\" height=\"44\"><rect x=\"-10\" y=\"-10\" width=\"44\" height=\"44\" fill=\"#fff\"/><g transform=\"rotate(-40.0 12.00 12.00)\"><path d=\"M0.40 12.00 A11.60 3.00 0 0 0 23.60 12.00\" fill=\"none\" stroke=\"#000\" stroke-width=\"6.10\"/></g><circle class=\"rs-p rs-browser-agent\" cx=\"21.07\" cy=\"4.94\" r=\"4.50\" fill=\"#000\"/></mask><mask id=\"rs-browser-l-m45-p2b\" maskUnits=\"userSpaceOnUse\" x=\"-10\" y=\"-10\" width=\"44\" height=\"44\"><rect x=\"-10\" y=\"-10\" width=\"44\" height=\"44\" fill=\"#fff\"/><circle class=\"rs-p rs-browser-agent\" cx=\"21.07\" cy=\"4.94\" r=\"4.50\" fill=\"#000\"/></mask></defs><g mask=\"url(#rs-browser-l-m45-p2a)\"><circle cx=\"12.00\" cy=\"12.00\" r=\"8.00\" fill=\"#fff\"/></g><g mask=\"url(#rs-browser-l-m45-p2b)\"><g transform=\"rotate(-40.0 12.00 12.00)\"><path d=\"M0.40 12.00 A11.60 3.00 0 0 0 23.60 12.00\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3.10\" stroke-linecap=\"round\"/></g></g><circle class=\"rs-p rs-browser-agent\" cx=\"21.068\" cy=\"4.936\" r=\"3.000\" fill=\"#fff\"/></g></mask><clipPath id=\"rs-browser-l-c46\"><path d=\"M1024.0 512.0 L1024.0 610.8 L1023.9 642.4 L1023.8 665.3 L1023.6 684.0 L1023.3 700.0 L1023.0 714.2 L1022.7 727.0 L1022.2 738.8 L1021.8 749.6 L1021.3 759.8 L1020.7 769.3 L1020.0 778.3 L1019.4 786.8 L1018.6 795.0 L1017.8 802.7 L1016.9 810.2 L1016.0 817.3 L1015.1 824.2 L1014.0 830.8 L1013.0 837.2 L1011.8 843.3 L1010.6 849.3 L1009.4 855.1 L1008.0 860.7 L1006.7 866.1 L1005.2 871.4 L1003.7 876.5 L1002.2 881.4 L1000.6 886.3 L998.9 891.0 L997.2 895.6 L995.4 900.0 L993.5 904.4 L991.6 908.6 L989.6 912.7 L987.6 916.7 L985.5 920.6 L983.3 924.5 L981.0 928.2 L978.7 931.8 L976.3 935.3 L973.9 938.8 L971.4 942.1 L968.8 945.4 L966.1 948.6 L963.4 951.7 L960.6 954.8 L957.7 957.7 L954.8 960.6 L951.7 963.4 L948.6 966.1 L945.4 968.8 L942.1 971.4 L938.8 973.9 L935.3 976.3 L931.8 978.7 L928.2 981.0 L924.5 983.3 L920.6 985.5 L916.7 987.6 L912.7 989.6 L908.6 991.6 L904.4 993.5 L900.0 995.4 L895.6 997.2 L891.0 998.9 L886.3 1000.6 L881.4 1002.2 L876.5 1003.7 L871.4 1005.2 L866.1 1006.7 L860.7 1008.0 L855.1 1009.4 L849.3 1010.6 L843.3 1011.8 L837.2 1013.0 L830.8 1014.0 L824.2 1015.1 L817.3 1016.0 L810.2 1016.9 L802.7 1017.8 L795.0 1018.6 L786.8 1019.4 L778.3 1020.0 L769.3 1020.7 L759.8 1021.3 L749.6 1021.8 L738.8 1022.2 L727.0 1022.7 L714.2 1023.0 L700.0 1023.3 L684.0 1023.6 L665.3 1023.8 L642.4 1023.9 L610.8 1024.0 L512.0 1024.0 L413.2 1024.0 L381.6 1023.9 L358.7 1023.8 L340.0 1023.6 L324.0 1023.3 L309.8 1023.0 L297.0 1022.7 L285.2 1022.2 L274.4 1021.8 L264.2 1021.3 L254.7 1020.7 L245.7 1020.0 L237.2 1019.4 L229.0 1018.6 L221.3 1017.8 L213.8 1016.9 L206.7 1016.0 L199.8 1015.1 L193.2 1014.0 L186.8 1013.0 L180.7 1011.8 L174.7 1010.6 L168.9 1009.4 L163.3 1008.0 L157.9 1006.7 L152.6 1005.2 L147.5 1003.7 L142.6 1002.2 L137.7 1000.6 L133.0 998.9 L128.4 997.2 L124.0 995.4 L119.6 993.5 L115.4 991.6 L111.3 989.6 L107.3 987.6 L103.4 985.5 L99.5 983.3 L95.8 981.0 L92.2 978.7 L88.7 976.3 L85.2 973.9 L81.9 971.4 L78.6 968.8 L75.4 966.1 L72.3 963.4 L69.2 960.6 L66.3 957.7 L63.4 954.8 L60.6 951.7 L57.9 948.6 L55.2 945.4 L52.6 942.1 L50.1 938.8 L47.7 935.3 L45.3 931.8 L43.0 928.2 L40.7 924.5 L38.5 920.6 L36.4 916.7 L34.4 912.7 L32.4 908.6 L30.5 904.4 L28.6 900.0 L26.8 895.6 L25.1 891.0 L23.4 886.3 L21.8 881.4 L20.3 876.5 L18.8 871.4 L17.3 866.1 L16.0 860.7 L14.6 855.1 L13.4 849.3 L12.2 843.3 L11.0 837.2 L10.0 830.8 L8.9 824.2 L8.0 817.3 L7.1 810.2 L6.2 802.7 L5.4 795.0 L4.6 786.8 L4.0 778.3 L3.3 769.3 L2.7 759.8 L2.2 749.6 L1.8 738.8 L1.3 727.0 L1.0 714.2 L0.7 700.0 L0.4 684.0 L0.2 665.3 L0.1 642.4 L0.0 610.8 L0.0 512.0 L0.0 413.2 L0.1 381.6 L0.2 358.7 L0.4 340.0 L0.7 324.0 L1.0 309.8 L1.3 297.0 L1.8 285.2 L2.2 274.4 L2.7 264.2 L3.3 254.7 L4.0 245.7 L4.6 237.2 L5.4 229.0 L6.2 221.3 L7.1 213.8 L8.0 206.7 L8.9 199.8 L10.0 193.2 L11.0 186.8 L12.2 180.7 L13.4 174.7 L14.6 168.9 L16.0 163.3 L17.3 157.9 L18.8 152.6 L20.3 147.5 L21.8 142.6 L23.4 137.7 L25.1 133.0 L26.8 128.4 L28.6 124.0 L30.5 119.6 L32.4 115.4 L34.4 111.3 L36.4 107.3 L38.5 103.4 L40.7 99.5 L43.0 95.8 L45.3 92.2 L47.7 88.7 L50.1 85.2 L52.6 81.9 L55.2 78.6 L57.9 75.4 L60.6 72.3 L63.4 69.2 L66.3 66.3 L69.2 63.4 L72.3 60.6 L75.4 57.9 L78.6 55.2 L81.9 52.6 L85.2 50.1 L88.7 47.7 L92.2 45.3 L95.8 43.0 L99.5 40.7 L103.4 38.5 L107.3 36.4 L111.3 34.4 L115.4 32.4 L119.6 30.5 L124.0 28.6 L128.4 26.8 L133.0 25.1 L137.7 23.4 L142.6 21.8 L147.5 20.3 L152.6 18.8 L157.9 17.3 L163.3 16.0 L168.9 14.6 L174.7 13.4 L180.7 12.2 L186.8 11.0 L193.2 10.0 L199.8 8.9 L206.7 8.0 L213.8 7.1 L221.3 6.2 L229.0 5.4 L237.2 4.6 L245.7 4.0 L254.7 3.3 L264.2 2.7 L274.4 2.2 L285.2 1.8 L297.0 1.3 L309.8 1.0 L324.0 0.7 L340.0 0.4 L358.7 0.2 L381.6 0.1 L413.2 0.0 L512.0 0.0 L610.8 0.0 L642.4 0.1 L665.3 0.2 L684.0 0.4 L700.0 0.7 L714.2 1.0 L727.0 1.3 L738.8 1.8 L749.6 2.2 L759.8 2.7 L769.3 3.3 L778.3 4.0 L786.8 4.6 L795.0 5.4 L802.7 6.2 L810.2 7.1 L817.3 8.0 L824.2 8.9 L830.8 10.0 L837.2 11.0 L843.3 12.2 L849.3 13.4 L855.1 14.6 L860.7 16.0 L866.1 17.3 L871.4 18.8 L876.5 20.3 L881.4 21.8 L886.3 23.4 L891.0 25.1 L895.6 26.8 L900.0 28.6 L904.4 30.5 L908.6 32.4 L912.7 34.4 L916.7 36.4 L920.6 38.5 L924.5 40.7 L928.2 43.0 L931.8 45.3 L935.3 47.7 L938.8 50.1 L942.1 52.6 L945.4 55.2 L948.6 57.9 L951.7 60.6 L954.8 63.4 L957.7 66.3 L960.6 69.2 L963.4 72.3 L966.1 75.4 L968.8 78.6 L971.4 81.9 L973.9 85.2 L976.3 88.7 L978.7 92.2 L981.0 95.8 L983.3 99.5 L985.5 103.4 L987.6 107.3 L989.6 111.3 L991.6 115.4 L993.5 119.6 L995.4 124.0 L997.2 128.4 L998.9 133.0 L1000.6 137.7 L1002.2 142.6 L1003.7 147.5 L1005.2 152.6 L1006.7 157.9 L1008.0 163.3 L1009.4 168.9 L1010.6 174.7 L1011.8 180.7 L1013.0 186.8 L1014.0 193.2 L1015.1 199.8 L1016.0 206.7 L1016.9 213.8 L1017.8 221.3 L1018.6 229.0 L1019.4 237.2 L1020.0 245.7 L1020.7 254.7 L1021.3 264.2 L1021.8 274.4 L1022.2 285.2 L1022.7 297.0 L1023.0 309.8 L1023.3 324.0 L1023.6 340.0 L1023.8 358.7 L1023.9 381.6 L1024.0 413.2 Z\"/></clipPath><linearGradient id=\"rs-browser-l-g47\" gradientUnits=\"userSpaceOnUse\" x1=\"83\" y1=\"152\" x2=\"941\" y2=\"872\"><stop offset=\"0.000\" stop-color=\"#009CB5\"/><stop offset=\"0.200\" stop-color=\"#009DAD\"/><stop offset=\"0.400\" stop-color=\"#009FA6\"/><stop offset=\"0.600\" stop-color=\"#00A09E\"/><stop offset=\"0.800\" stop-color=\"#00A197\"/><stop offset=\"1.000\" stop-color=\"#00A28E\"/></linearGradient><filter id=\"rs-browser-l-f48\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\"><feGaussianBlur stdDeviation=\"14\"/></filter></defs><g clip-path=\"url(#rs-browser-l-c46)\"><rect width=\"1024\" height=\"1024\" fill=\"url(#rs-browser-l-g47)\"/><defs><linearGradient id=\"rs-browser-l-gs31\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#B9E7F3\" stop-opacity=\"0.140\"/><stop offset=\".75\" stop-color=\"#B9E7F3\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rs-browser-l-gl32\" x1=\"0\" x2=\"1\"><stop offset=\"0\" stop-color=\"#B9E7F3\" stop-opacity=\"0.100\"/><stop offset=\"1\" stop-color=\"#B9E7F3\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rs-browser-l-gr33\" x1=\"1\" x2=\"0\"><stop offset=\"0\" stop-color=\"#B9E7F3\" stop-opacity=\"0.100\"/><stop offset=\"1\" stop-color=\"#B9E7F3\" stop-opacity=\"0\"/></linearGradient></defs><path fill=\"url(#rs-browser-l-gs31)\"  d=\"M245.8 176.7 L778.2 -17.0 L778.2 1040.6 L245.8 846.6 Z\"/><path fill=\"url(#rs-browser-l-gl32)\"  d=\"M-78.1 393.8 L245.8 512.0 L-78.1 630.1 Z\"/><path fill=\"url(#rs-browser-l-gr33)\"  d=\"M1102.1 394.0 L778.2 512.0 L1102.1 629.7 Z\"/><g filter=\"url(#rs-browser-l-f48)\" opacity=\".34\"><g transform=\"translate(0 22)\"><rect width=\"1024\" height=\"1024\" fill=\"#005146\" mask=\"url(#rs-browser-l-m45)\"/></g></g><rect width=\"1024\" height=\"1024\" fill=\"#FFFFFF\" mask=\"url(#rs-browser-l-m45)\"/><rect class=\"rs-launchlight\" width=\"1024\" height=\"1024\" fill=\"url(#rs-browser-l-lb)\"/><g clip-path=\"url(#rs-browser-l-door)\"><rect class=\"rs-doorlight\" width=\"1024\" height=\"1024\" fill=\"url(#rs-browser-l-lb)\"/></g></g></svg>","dark":"<svg class=\"rs-icon rs-icon--browser\" role=\"presentation\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><defs><linearGradient id=\"rs-browser-d-lb\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0.839\"><stop offset=\"0.38\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"0.5\" stop-color=\"#fff\" stop-opacity=\"0.16\"/><stop offset=\"0.62\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient><clipPath id=\"rs-browser-d-door\"><path d=\"M245.8 176.7 L778.2 -17.0 L778.2 1040.6 L245.8 846.6 Z\"/></clipPath><clipPath id=\"rs-browser-d-sq\"><path d=\"M1024.0 512.0 L1024.0 610.8 L1023.9 642.4 L1023.8 665.3 L1023.6 684.0 L1023.3 700.0 L1023.0 714.2 L1022.7 727.0 L1022.2 738.8 L1021.8 749.6 L1021.3 759.8 L1020.7 769.3 L1020.0 778.3 L1019.4 786.8 L1018.6 795.0 L1017.8 802.7 L1016.9 810.2 L1016.0 817.3 L1015.1 824.2 L1014.0 830.8 L1013.0 837.2 L1011.8 843.3 L1010.6 849.3 L1009.4 855.1 L1008.0 860.7 L1006.7 866.1 L1005.2 871.4 L1003.7 876.5 L1002.2 881.4 L1000.6 886.3 L998.9 891.0 L997.2 895.6 L995.4 900.0 L993.5 904.4 L991.6 908.6 L989.6 912.7 L987.6 916.7 L985.5 920.6 L983.3 924.5 L981.0 928.2 L978.7 931.8 L976.3 935.3 L973.9 938.8 L971.4 942.1 L968.8 945.4 L966.1 948.6 L963.4 951.7 L960.6 954.8 L957.7 957.7 L954.8 960.6 L951.7 963.4 L948.6 966.1 L945.4 968.8 L942.1 971.4 L938.8 973.9 L935.3 976.3 L931.8 978.7 L928.2 981.0 L924.5 983.3 L920.6 985.5 L916.7 987.6 L912.7 989.6 L908.6 991.6 L904.4 993.5 L900.0 995.4 L895.6 997.2 L891.0 998.9 L886.3 1000.6 L881.4 1002.2 L876.5 1003.7 L871.4 1005.2 L866.1 1006.7 L860.7 1008.0 L855.1 1009.4 L849.3 1010.6 L843.3 1011.8 L837.2 1013.0 L830.8 1014.0 L824.2 1015.1 L817.3 1016.0 L810.2 1016.9 L802.7 1017.8 L795.0 1018.6 L786.8 1019.4 L778.3 1020.0 L769.3 1020.7 L759.8 1021.3 L749.6 1021.8 L738.8 1022.2 L727.0 1022.7 L714.2 1023.0 L700.0 1023.3 L684.0 1023.6 L665.3 1023.8 L642.4 1023.9 L610.8 1024.0 L512.0 1024.0 L413.2 1024.0 L381.6 1023.9 L358.7 1023.8 L340.0 1023.6 L324.0 1023.3 L309.8 1023.0 L297.0 1022.7 L285.2 1022.2 L274.4 1021.8 L264.2 1021.3 L254.7 1020.7 L245.7 1020.0 L237.2 1019.4 L229.0 1018.6 L221.3 1017.8 L213.8 1016.9 L206.7 1016.0 L199.8 1015.1 L193.2 1014.0 L186.8 1013.0 L180.7 1011.8 L174.7 1010.6 L168.9 1009.4 L163.3 1008.0 L157.9 1006.7 L152.6 1005.2 L147.5 1003.7 L142.6 1002.2 L137.7 1000.6 L133.0 998.9 L128.4 997.2 L124.0 995.4 L119.6 993.5 L115.4 991.6 L111.3 989.6 L107.3 987.6 L103.4 985.5 L99.5 983.3 L95.8 981.0 L92.2 978.7 L88.7 976.3 L85.2 973.9 L81.9 971.4 L78.6 968.8 L75.4 966.1 L72.3 963.4 L69.2 960.6 L66.3 957.7 L63.4 954.8 L60.6 951.7 L57.9 948.6 L55.2 945.4 L52.6 942.1 L50.1 938.8 L47.7 935.3 L45.3 931.8 L43.0 928.2 L40.7 924.5 L38.5 920.6 L36.4 916.7 L34.4 912.7 L32.4 908.6 L30.5 904.4 L28.6 900.0 L26.8 895.6 L25.1 891.0 L23.4 886.3 L21.8 881.4 L20.3 876.5 L18.8 871.4 L17.3 866.1 L16.0 860.7 L14.6 855.1 L13.4 849.3 L12.2 843.3 L11.0 837.2 L10.0 830.8 L8.9 824.2 L8.0 817.3 L7.1 810.2 L6.2 802.7 L5.4 795.0 L4.6 786.8 L4.0 778.3 L3.3 769.3 L2.7 759.8 L2.2 749.6 L1.8 738.8 L1.3 727.0 L1.0 714.2 L0.7 700.0 L0.4 684.0 L0.2 665.3 L0.1 642.4 L0.0 610.8 L0.0 512.0 L0.0 413.2 L0.1 381.6 L0.2 358.7 L0.4 340.0 L0.7 324.0 L1.0 309.8 L1.3 297.0 L1.8 285.2 L2.2 274.4 L2.7 264.2 L3.3 254.7 L4.0 245.7 L4.6 237.2 L5.4 229.0 L6.2 221.3 L7.1 213.8 L8.0 206.7 L8.9 199.8 L10.0 193.2 L11.0 186.8 L12.2 180.7 L13.4 174.7 L14.6 168.9 L16.0 163.3 L17.3 157.9 L18.8 152.6 L20.3 147.5 L21.8 142.6 L23.4 137.7 L25.1 133.0 L26.8 128.4 L28.6 124.0 L30.5 119.6 L32.4 115.4 L34.4 111.3 L36.4 107.3 L38.5 103.4 L40.7 99.5 L43.0 95.8 L45.3 92.2 L47.7 88.7 L50.1 85.2 L52.6 81.9 L55.2 78.6 L57.9 75.4 L60.6 72.3 L63.4 69.2 L66.3 66.3 L69.2 63.4 L72.3 60.6 L75.4 57.9 L78.6 55.2 L81.9 52.6 L85.2 50.1 L88.7 47.7 L92.2 45.3 L95.8 43.0 L99.5 40.7 L103.4 38.5 L107.3 36.4 L111.3 34.4 L115.4 32.4 L119.6 30.5 L124.0 28.6 L128.4 26.8 L133.0 25.1 L137.7 23.4 L142.6 21.8 L147.5 20.3 L152.6 18.8 L157.9 17.3 L163.3 16.0 L168.9 14.6 L174.7 13.4 L180.7 12.2 L186.8 11.0 L193.2 10.0 L199.8 8.9 L206.7 8.0 L213.8 7.1 L221.3 6.2 L229.0 5.4 L237.2 4.6 L245.7 4.0 L254.7 3.3 L264.2 2.7 L274.4 2.2 L285.2 1.8 L297.0 1.3 L309.8 1.0 L324.0 0.7 L340.0 0.4 L358.7 0.2 L381.6 0.1 L413.2 0.0 L512.0 0.0 L610.8 0.0 L642.4 0.1 L665.3 0.2 L684.0 0.4 L700.0 0.7 L714.2 1.0 L727.0 1.3 L738.8 1.8 L749.6 2.2 L759.8 2.7 L769.3 3.3 L778.3 4.0 L786.8 4.6 L795.0 5.4 L802.7 6.2 L810.2 7.1 L817.3 8.0 L824.2 8.9 L830.8 10.0 L837.2 11.0 L843.3 12.2 L849.3 13.4 L855.1 14.6 L860.7 16.0 L866.1 17.3 L871.4 18.8 L876.5 20.3 L881.4 21.8 L886.3 23.4 L891.0 25.1 L895.6 26.8 L900.0 28.6 L904.4 30.5 L908.6 32.4 L912.7 34.4 L916.7 36.4 L920.6 38.5 L924.5 40.7 L928.2 43.0 L931.8 45.3 L935.3 47.7 L938.8 50.1 L942.1 52.6 L945.4 55.2 L948.6 57.9 L951.7 60.6 L954.8 63.4 L957.7 66.3 L960.6 69.2 L963.4 72.3 L966.1 75.4 L968.8 78.6 L971.4 81.9 L973.9 85.2 L976.3 88.7 L978.7 92.2 L981.0 95.8 L983.3 99.5 L985.5 103.4 L987.6 107.3 L989.6 111.3 L991.6 115.4 L993.5 119.6 L995.4 124.0 L997.2 128.4 L998.9 133.0 L1000.6 137.7 L1002.2 142.6 L1003.7 147.5 L1005.2 152.6 L1006.7 157.9 L1008.0 163.3 L1009.4 168.9 L1010.6 174.7 L1011.8 180.7 L1013.0 186.8 L1014.0 193.2 L1015.1 199.8 L1016.0 206.7 L1016.9 213.8 L1017.8 221.3 L1018.6 229.0 L1019.4 237.2 L1020.0 245.7 L1020.7 254.7 L1021.3 264.2 L1021.8 274.4 L1022.2 285.2 L1022.7 297.0 L1023.0 309.8 L1023.3 324.0 L1023.6 340.0 L1023.8 358.7 L1023.9 381.6 L1024.0 413.2 Z\"/></clipPath><mask id=\"rs-browser-d-m39\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"1024\" height=\"1024\"><g transform=\"translate(512 512) scale(33.96569) translate(-13.5909 -11.8452)\"><defs><mask id=\"rs-browser-d-m39-p2a\" maskUnits=\"userSpaceOnUse\" x=\"-10\" y=\"-10\" width=\"44\" height=\"44\"><rect x=\"-10\" y=\"-10\" width=\"44\" height=\"44\" fill=\"#fff\"/><g transform=\"rotate(-40.0 12.00 12.00)\"><path d=\"M0.40 12.00 A11.60 3.00 0 0 0 23.60 12.00\" fill=\"none\" stroke=\"#000\" stroke-width=\"6.10\"/></g><circle class=\"rs-p rs-browser-agent\" cx=\"21.07\" cy=\"4.94\" r=\"4.50\" fill=\"#000\"/></mask><mask id=\"rs-browser-d-m39-p2b\" maskUnits=\"userSpaceOnUse\" x=\"-10\" y=\"-10\" width=\"44\" height=\"44\"><rect x=\"-10\" y=\"-10\" width=\"44\" height=\"44\" fill=\"#fff\"/><circle class=\"rs-p rs-browser-agent\" cx=\"21.07\" cy=\"4.94\" r=\"4.50\" fill=\"#000\"/></mask></defs><g mask=\"url(#rs-browser-d-m39-p2a)\"><circle cx=\"12.00\" cy=\"12.00\" r=\"8.00\" fill=\"#fff\"/></g><g mask=\"url(#rs-browser-d-m39-p2b)\"><g transform=\"rotate(-40.0 12.00 12.00)\"><path d=\"M0.40 12.00 A11.60 3.00 0 0 0 23.60 12.00\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3.10\" stroke-linecap=\"round\"/></g></g><circle class=\"rs-p rs-browser-agent\" cx=\"21.068\" cy=\"4.936\" r=\"3.000\" fill=\"#fff\"/></g></mask><linearGradient id=\"rs-browser-d-g40\" gradientUnits=\"userSpaceOnUse\" x1=\"83\" y1=\"152\" x2=\"941\" y2=\"872\"><stop offset=\"0.000\" stop-color=\"#49C3DD\"/><stop offset=\"0.200\" stop-color=\"#3DC1D2\"/><stop offset=\"0.400\" stop-color=\"#34BFC7\"/><stop offset=\"0.600\" stop-color=\"#2EBCBB\"/><stop offset=\"0.800\" stop-color=\"#2CB9AE\"/><stop offset=\"1.000\" stop-color=\"#2FB6A1\"/></linearGradient></defs><g clip-path=\"url(#rs-browser-d-sq)\"><rect width=\"1024\" height=\"1024\" fill=\"#1A1C20\"/><defs><linearGradient id=\"rs-browser-d-gs28\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"0.100\"/><stop offset=\".75\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rs-browser-d-gl29\" x1=\"0\" x2=\"1\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"0.050\"/><stop offset=\"1\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rs-browser-d-gr30\" x1=\"1\" x2=\"0\"><stop offset=\"0\" stop-color=\"#FFFFFF\" stop-opacity=\"0.050\"/><stop offset=\"1\" stop-color=\"#FFFFFF\" stop-opacity=\"0\"/></linearGradient></defs><path fill=\"url(#rs-browser-d-gs28)\"  d=\"M245.8 176.7 L778.2 -17.0 L778.2 1040.6 L245.8 846.6 Z\"/><path fill=\"url(#rs-browser-d-gl29)\"  d=\"M-78.1 393.8 L245.8 512.0 L-78.1 630.1 Z\"/><path fill=\"url(#rs-browser-d-gr30)\"  d=\"M1102.1 394.0 L778.2 512.0 L1102.1 629.7 Z\"/><rect width=\"1024\" height=\"1024\" fill=\"url(#rs-browser-d-g40)\" mask=\"url(#rs-browser-d-m39)\"/><rect class=\"rs-launchlight\" width=\"1024\" height=\"1024\" fill=\"url(#rs-browser-d-lb)\"/><g clip-path=\"url(#rs-browser-d-door)\"><rect class=\"rs-doorlight\" width=\"1024\" height=\"1024\" fill=\"url(#rs-browser-d-lb)\"/></g></g></svg>"}

const ARRIVE = 1400 // MarkReveal arrival
const HOLD = 300 // the lockup at rest before it hands over
const COVER = 320 // the lockup re-covered along the same edge (duration-slow)
const SETTLE = 600 // product icon settling in from 90 percent
const MIN_PRODUCT = 900 // the product beat is seen even when the app is already up
const OUT = 280 // the splash leaving

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function seen(key) {
  try {
    return window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function markSeen(key) {
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    /* a private window still shows the splash, just every time */
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Show the splash over the page and remove it when `ready` settles.
 *
 * @param {object} opts
 * @param {string} opts.logoLight  URL of redrob-logo-primary.png (light ground)
 * @param {string} opts.logoDark   URL of redrob-logo-primary-white.png (dark ground)
 * @param {Promise<unknown>} [opts.ready]  settles when the app can be used
 * @param {'light'|'dark'|'system'} [opts.theme]  default: data-theme, then the system
 * @param {HTMLElement} [opts.parent]  default: document.body
 * @param {boolean} [opts.once]  once per session (sessionStorage), default true
 * @param {boolean} [opts.reducedMotion]  default: the system setting
 * @param {number} [opts.maxMs]  give up waiting for `ready` after this, default 20000
 * @returns {Promise<void>} resolves once the splash is gone
 */
export function showRedrobSplash(opts) {
  const key = `redrob-splash:${PRODUCT}`
  const once = opts.once !== false
  if (once && seen(key)) return Promise.resolve()
  if (once) markSeen(key)

  const still = typeof opts.reducedMotion === "boolean" ? opts.reducedMotion : reducedMotion()
  const theme = resolveTheme(opts.theme)
  const parent = opts.parent || document.body
  const ready = Promise.race([Promise.resolve(opts.ready).catch(() => {}), wait(opts.maxMs ?? 20000)])

  const root = document.createElement('div')
  root.className = `rs-splash rs-splash--${theme}${still ? ' rs-splash--still' : ''}`
  root.setAttribute('data-product', PRODUCT)
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('aria-label', `${NAME} is starting`)
  root.innerHTML =
    '<div class="rs-splash__ground" aria-hidden="true"></div>' +
    '<div class="rs-splash__beat rs-splash__brand">' +
    '<div class="rs-splash__lock">' +
    `<img class="rs-splash__art" alt="" draggable="false" src="${theme === 'dark' ? opts.logoDark : opts.logoLight}">` +
    '<span class="rs-splash__sheen" aria-hidden="true"></span>' +
    '</div></div>' +
    '<div class="rs-splash__beat rs-splash__product" hidden>' +
    `<div class="rs-splash__icon">${ICONS[theme]}</div>` +
    `<p class="rs-splash__name">${NAME}</p>` +
    '</div>'
  const lock = root.querySelector('.rs-splash__lock')
  lock.style.setProperty('--rs-mask', `url("${theme === 'dark' ? opts.logoDark : opts.logoLight}")`)
  parent.appendChild(root)

  let skipped = false
  let wake = () => {}
  const skip = () => {
    skipped = true
    wake()
  }
  const pause = (ms) =>
    skipped ? Promise.resolve() : new Promise((r) => {
      const t = setTimeout(r, ms)
      wake = () => {
        clearTimeout(t)
        r()
      }
    })
  root.addEventListener('click', skip)
  window.addEventListener('keydown', skip)

  const brand = root.querySelector('.rs-splash__brand')
  const product = root.querySelector('.rs-splash__product')

  return (async () => {
    // Beat 1: the group's mark.
    await pause(still ? 700 : ARRIVE + HOLD)
    if (!still && !skipped) {
      brand.classList.add('rs-splash__brand--cover')
      await pause(COVER)
    }
    // Beat 2: the product.
    brand.hidden = true
    product.hidden = false
    root.classList.add('rs-splash--product')
    await pause(still ? MIN_PRODUCT : SETTLE + MIN_PRODUCT)
    await ready
    window.removeEventListener('keydown', skip)
    if (!still) {
      root.classList.add('rs-splash--out')
      await wait(OUT)
    }
    root.remove()
  })()
}

export default showRedrobSplash
