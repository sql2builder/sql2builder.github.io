// select posts.* from posts,
//     (select count,max(created_date) as created_date
// from posts
// group by count) max_counts
// where posts.count=max_counts.count
// and posts.created_date=max_counts.created_date
let cross_join_ast = [
    {
        "Query": {
            "with": null,
            "body": {
                "Select": {
                    "distinct": false,
                    "top": null,
                    "projection": [
                        {
                            "QualifiedWildcard": [
                                {
                                    "value": "posts",
                                    "quote_style": null
                                }
                            ]
                        }
                    ],
                    "from": [
                        {
                            "relation": {
                                "Table": {
                                    "name": [
                                        {
                                            "value": "posts",
                                            "quote_style": null
                                        }
                                    ],
                                    "alias": null,
                                    "args": [],
                                    "with_hints": []
                                }
                            },
                            "joins": []
                        },
                        {
                            "relation": {
                                "Derived": {
                                    "lateral": false,
                                    "subquery": {
                                        "with": null,
                                        "body": {
                                            "Select": {
                                                "distinct": false,
                                                "top": null,
                                                "projection": [
                                                    {
                                                        "UnnamedExpr": {
                                                            "Identifier": {
                                                                "value": "count",
                                                                "quote_style": null
                                                            }
                                                        }
                                                    },
                                                    {
                                                        "ExprWithAlias": {
                                                            "expr": {
                                                                "Function": {
                                                                    "name": [
                                                                        {
                                                                            "value": "max",
                                                                            "quote_style": null
                                                                        }
                                                                    ],
                                                                    "args": [
                                                                        {
                                                                            "Unnamed": {
                                                                                "Expr": {
                                                                                    "Identifier": {
                                                                                        "value": "created_date",
                                                                                        "quote_style": null
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    ],
                                                                    "over": null,
                                                                    "distinct": false
                                                                }
                                                            },
                                                            "alias": {
                                                                "value": "created_date",
                                                                "quote_style": null
                                                            }
                                                        }
                                                    }
                                                ],
                                                "from": [
                                                    {
                                                        "relation": {
                                                            "Table": {
                                                                "name": [
                                                                    {
                                                                        "value": "posts",
                                                                        "quote_style": null
                                                                    }
                                                                ],
                                                                "alias": null,
                                                                "args": [],
                                                                "with_hints": []
                                                            }
                                                        },
                                                        "joins": []
                                                    }
                                                ],
                                                "lateral_views": [],
                                                "selection": null,
                                                "group_by": [
                                                    {
                                                        "Identifier": {
                                                            "value": "count",
                                                            "quote_style": null
                                                        }
                                                    }
                                                ],
                                                "cluster_by": [],
                                                "distribute_by": [],
                                                "sort_by": [],
                                                "having": null
                                            }
                                        },
                                        "order_by": [],
                                        "limit": null,
                                        "offset": null,
                                        "fetch": null
                                    },
                                    "alias": {
                                        "name": {
                                            "value": "max_counts",
                                            "quote_style": null
                                        },
                                        "columns": []
                                    }
                                }
                            },
                            "joins": []
                        }
                    ],
                    "lateral_views": [],
                    "selection": {
                        "BinaryOp": {
                            "left": {
                                "BinaryOp": {
                                    "left": {
                                        "CompoundIdentifier": [
                                            {
                                                "value": "posts",
                                                "quote_style": null
                                            },
                                            {
                                                "value": "count",
                                                "quote_style": null
                                            }
                                        ]
                                    },
                                    "op": "Eq",
                                    "right": {
                                        "CompoundIdentifier": [
                                            {
                                                "value": "max_counts",
                                                "quote_style": null
                                            },
                                            {
                                                "value": "count",
                                                "quote_style": null
                                            }
                                        ]
                                    }
                                }
                            },
                            "op": "And",
                            "right": {
                                "BinaryOp": {
                                    "left": {
                                        "CompoundIdentifier": [
                                            {
                                                "value": "posts",
                                                "quote_style": null
                                            },
                                            {
                                                "value": "created_date",
                                                "quote_style": null
                                            }
                                        ]
                                    },
                                    "op": "Eq",
                                    "right": {
                                        "CompoundIdentifier": [
                                            {
                                                "value": "max_counts",
                                                "quote_style": null
                                            },
                                            {
                                                "value": "created_date",
                                                "quote_style": null
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    "group_by": [],
                    "cluster_by": [],
                    "distribute_by": [],
                    "sort_by": [],
                    "having": null
                }
            },
            "order_by": [],
            "limit": null,
            "offset": null,
            "fetch": null
        }
    }
];

export {cross_join_ast};
