// @ts-check
// usePageMeta — hand-rolled React hook that sets <title> and idempotently
// creates / updates the meta tags we care about for SEO and social
// previews. Used by every /legal/* page so reviewers and search engines
// see the right title, description, canonical, and robots directive.
//
// Why hand-rolled: the spec asked for SEO metadata without adding a new
// dependency (react-helmet-async). The footprint is small enough to own.
//
// Behaviour:
//   • Sets document.title on mount and every time `title` changes.
//   • Creates or updates <meta name="description">, <meta name="robots">,
//     <link rel="canonical">, and OpenGraph + Twitter card tags.
//   • Tags are kept across navigations (we update in place rather than
//     remove on unmount) — every legal page calls the hook again, so
//     stale values never surface.
//
// Each tag is stamped with `data-page-meta="1"` so it's clear in DevTools
// which tags this hook owns.

import { useEffect } from 'react';

/**
 * @typedef {Object} PageMeta
 * @property {string} title
 * @property {string=} description
 * @property {string=} canonical
 * @property {string=} robots          - defaults to 'index, follow'
 * @property {string=} ogTitle
 * @property {string=} ogDescription
 * @property {string=} ogType          - defaults to 'article'
 * @property {string=} ogUrl
 * @property {string=} twitterCard     - defaults to 'summary_large_image'
 */

function upsertMetaName(name, content) {
  if (!content) return;
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    el.setAttribute('data-page-meta', '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertMetaProperty(property, content) {
  if (!content) return;
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    el.setAttribute('data-page-meta', '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href) {
  if (!href) return;
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    el.setAttribute('data-page-meta', '1');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Set page metadata. Call at the top of any page component.
 * @param {PageMeta} meta
 */
export function usePageMeta(meta) {
  const {
    title,
    description,
    canonical,
    robots = 'index, follow',
    ogTitle,
    ogDescription,
    ogType = 'article',
    ogUrl,
    twitterCard = 'summary_large_image',
  } = meta;

  useEffect(() => {
    if (title) document.title = title;
    upsertMetaName('description', description);
    upsertMetaName('robots', robots);
    upsertCanonical(canonical);
    upsertMetaProperty('og:title', ogTitle || title);
    upsertMetaProperty('og:description', ogDescription || description);
    upsertMetaProperty('og:type', ogType);
    upsertMetaProperty('og:url', ogUrl || canonical);
    upsertMetaName('twitter:card', twitterCard);
    upsertMetaName('twitter:title', ogTitle || title);
    upsertMetaName('twitter:description', ogDescription || description);
  }, [title, description, canonical, robots, ogTitle, ogDescription, ogType, ogUrl, twitterCard]);
}
