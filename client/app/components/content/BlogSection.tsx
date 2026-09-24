"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { use } from "react";
import BlogPostCard from "~/app/[slug]/blog/BlogPostCard.tsx";
import { slugPath } from "~/helpers/utility-functions.ts";
import type { PostResponse } from "~/server/db/schema/posts.ts";

type Props = {
  latestBlogPostsPromise: Promise<(PostResponse & { authorName?: string | null })[]>;
};

function BlogSection({ latestBlogPostsPromise }: Props) {
  const latestBlogPosts = use(latestBlogPostsPromise);

  const { slug }: { slug: string } = useParams();

  if (latestBlogPosts.length === 0) return;

  return (
    <>
      <Link
        href={slugPath(slug, "/blog")}
        prefetch={false}
        className="rr-basic-heading fs-3 link-body-emphasis link-underline-opacity-0 link-underline-opacity-100-hover"
      >
        Blog
      </Link>

      <div className="row row-gap-3">
        {latestBlogPosts.map((post) => (
          <div key={post.id} className="col-lg-6">
            <BlogPostCard organizationSlug={slug} post={post} />
          </div>
        ))}
      </div>
    </>
  );
}

export default BlogSection;
