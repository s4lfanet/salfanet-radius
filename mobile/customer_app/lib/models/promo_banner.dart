class PromoBanner {
  const PromoBanner({required this.id, required this.imageUrl, this.linkUrl, this.title});
  final String id;
  final String imageUrl;
  final String? linkUrl;
  final String? title;

  factory PromoBanner.fromJson(Map<String, dynamic> json) => PromoBanner(
        id: json['id']?.toString() ?? '',
        imageUrl: json['imageUrl']?.toString() ?? '',
        linkUrl: json['linkUrl']?.toString(),
        title: json['title']?.toString(),
      );
}
