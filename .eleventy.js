module.exports = function(eleventyConfig) {
  // Pass through styles
  eleventyConfig.addPassthroughCopy("src/styles");
  
  // Pass through images and assets
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/assets");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    }
  };
};
