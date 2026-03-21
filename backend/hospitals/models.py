from django.db import models

class Hospital(models.Model):
    name     = models.CharField(max_length=200)
    city     = models.CharField(max_length=100)
    address  = models.TextField(blank=True)
    mobile   = models.CharField(max_length=15, unique=True)
    email    = models.EmailField(blank=True)
    image    = models.ImageField(upload_to='hospitals/', blank=True)
    password = models.CharField(max_length=128)
    status   = models.CharField(max_length=20, default='active')
    created  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
