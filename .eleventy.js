const Modal = require('./src/_includes/components/Modal.js');

module.exports = function(eleventyConfig) {
  // Video shortcode for YouTube and Vimeo
  eleventyConfig.addShortcode("video", function(platform, videoId, title = "") {
    const embedUrls = {
      youtube: `https://www.youtube.com/embed/${videoId}`,
      vimeo: `https://player.vimeo.com/video/${videoId}`
    };
    
    const titleAttr = title ? `title="${title}"` : '';
    
    return `<div class="video-container">
      <iframe src="${embedUrls[platform]}" 
              ${titleAttr}
              frameborder="0" 
              allowfullscreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
    </div>`;
  });

  // Podcast shortcode for Apple Podcasts with timestamps
  eleventyConfig.addShortcode("podcast", function(episodeUrl, title = "") {
    // Extract podcast ID and episode ID from URL
    // URL format: https://podcasts.apple.com/us/podcast/[name]/id[podcastId]?i=[episodeId]
    const podcastIdMatch = episodeUrl.match(/\/id(\d+)/);
    const episodeIdMatch = episodeUrl.match(/[?&]i=(\d+)/);
    
    if (!podcastIdMatch || !episodeIdMatch) {
      return `<p>Invalid podcast URL</p>`;
    }
    
    const podcastId = podcastIdMatch[1];
    const episodeId = episodeIdMatch[1];
    const embedUrl = `https://embed.podcasts.apple.com/us/podcast/id${podcastId}?i=${episodeId}`;
    
    return `<div class="podcast-container">
      <iframe src="${embedUrl}" 
              height="175" 
              frameborder="0" 
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" 
              allow="autoplay *; encrypted-media *; clipboard-write" 
              style="width: 100%; max-width: 660px; overflow: hidden; border-radius: 10px; background: transparent;"></iframe>
    </div>`;
  });

  // Modal shortcode
  eleventyConfig.addShortcode("Modal", Modal); // This is a shortcode/component for bootstrap modals
  eleventyConfig.addWatchTarget("src/_includes/components/Modal.js"); // Watch for changes in the modal component

  // Pass through styles
  eleventyConfig.addPassthroughCopy("src/styles");
  
  // Pass through images and assets
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/assets");
  
  // Pass through CNAME for custom domain
  eleventyConfig.addPassthroughCopy("src/CNAME");

  return {
    pathPrefix: process.env.ELEVENTY_PATH_PREFIX || "/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    }
  };
};
