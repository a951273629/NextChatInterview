import webpack from "webpack";

const mode = process.env.BUILD_MODE ?? "standalone";
console.log("[Next] build mode", mode);

const disableChunk = !!process.env.DISABLE_CHUNK || mode === "export";
console.log("[Next] build with chunk: ", !disableChunk);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode:false,
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    if (disableChunk) {
      config.plugins.push(
        new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
      );
    }

    /**
     * 告诉webpack不要包含这些模块 因为浏览器不支持
     */
    config.resolve.fallback = {
      child_process: false,
      fs: false,
      path: false,
      canvas: false,
    };

    // 把这个js当做静态资源，不要进行编译(因为编译器会使用hash改变文件的名称)
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?js/,
      type: 'asset/resource',
      generator: {
        filename: 'static/worker/[hash][ext][query]'
      }
    });

    // 重定向 加载.js 会映射.mjs
    config.resolve.alias = {
      ...config.resolve.alias,
      'pdfjs-dist/build/pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.mjs',
    };

    return config;
  },
  output: mode,
  images: {
    unoptimized: mode === "export",
  },
  experimental: {
    forceSwcTransforms: true,
  },
};

const CorsHeaders = [
  { key: "Access-Control-Allow-Credentials", value: "true" },
  { key: "Access-Control-Allow-Origin", value: "*" },
  {
    key: "Access-Control-Allow-Methods",
    value: "*",
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "*",
  },
  {
    key: "Access-Control-Max-Age",
    value: "86400",
  },
];

if (mode !== "export") {
  nextConfig.headers = async () => {
    return [
      {
        source: "/api/:path*",
        headers: CorsHeaders,
      },
      {
        // 为PDF.js worker文件添加正确的MIME类型和CORS头
        source: "/pdf.worker.min.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  };

  nextConfig.rewrites = async () => {
    const ret = [
      // adjust for previous version directly using "/api/proxy/" as proxy base route
      // {
      //   source: "/api/proxy/v1/:path*",
      //   destination: "https://api.openai.com/v1/:path*",
      // },
      {
        // https://{resource_name}.openai.azure.com/openai/deployments/{deploy_name}/chat/completions
        source:
          "/api/proxy/azure/:resource_name/deployments/:deploy_name/:path*",
        destination:
          "https://:resource_name.openai.azure.com/openai/deployments/:deploy_name/:path*",
      },
      {
        source: "/api/proxy/google/:path*",
        destination: "https://generativelanguage.googleapis.com/:path*",
      },
      {
        source: "/api/proxy/openai/:path*",
        destination: "https://api.openai.com/:path*",
      },
      {
        source: "/api/proxy/anthropic/:path*",
        destination: "https://api.anthropic.com/:path*",
      },
      {
        source: "/google-fonts/:path*",
        destination: "https://fonts.googleapis.com/:path*",
      },
      {
        source: "/sharegpt",
        destination: "https://sharegpt.com/api/conversations",
      },
      {
        source: "/api/proxy/alibaba/:path*",
        destination: "https://dashscope.aliyuncs.com/api/:path*",
      },
    ];

    return {
      beforeFiles: ret,
    };
  };
}

export default nextConfig;
